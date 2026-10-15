import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { describe, expect, it } from "vitest";
import { DEFAULT_LOCALE, LOCALES, isLocale, translate } from "@/i18n/locales";
import { HI_MESSAGES } from "@/i18n/messages/hi";

/**
 * The translation guard. Every English sentence the app passes to t("...") or msg("...") must have a
 * Hindi entry, and every Hindi entry must still match a sentence in the code, so the dictionary can
 * neither fall behind the screens nor collect leftovers. Placeholders ({name}) must survive translation.
 */

const SRC = join(process.cwd(), "src");

function sourceFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== "generated") sourceFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

function sentencesInCode(): Map<string, string> {
  const found = new Map<string, string>(); // sentence -> first file
  for (const file of sourceFiles(SRC)) {
    const text = readFileSync(file, "utf8");
    if (!/\b(t|msg)\(/.test(text)) continue;
    const kind = file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
    const visit = (node: ts.Node) => {
      if (
        ts.isCallExpression(node) &&
        ts.isIdentifier(node.expression) &&
        (node.expression.text === "t" || node.expression.text === "msg")
      ) {
        const arg = node.arguments[0];
        if (arg && (ts.isStringLiteral(arg) || ts.isNoSubstitutionTemplateLiteral(arg))) {
          if (!found.has(arg.text)) found.set(arg.text, file.replace(SRC, "src"));
        }
      }
      if (ts.isJsxSelfClosingElement(node) && node.tagName.getText(source) === "T") {
        for (const attr of node.attributes.properties) {
          if (
            ts.isJsxAttribute(attr) &&
            attr.name.getText(source) === "text" &&
            attr.initializer &&
            ts.isStringLiteral(attr.initializer) &&
            !found.has(attr.initializer.text)
          ) {
            found.set(attr.initializer.text, file.replace(SRC, "src"));
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(source);
  }
  return found;
}

const ERROR_CLASSES = new Set([
  "ValidationError",
  "ConflictError",
  "NotFoundError",
  "AuthorizationError",
  "RateLimitedError",
  "AppError",
  "UnauthenticatedError",
]);
const ZOD_CHECKS = new Set([
  "min",
  "max",
  "regex",
  "email",
  "uuid",
  "refine",
  "length",
  "positive",
  "int",
  "url",
  "nonempty",
]);

/** Messages written in server code that reach the screen: thrown errors, action fallbacks, rule results, zod checks. */
function serverMessages(): Map<string, string> {
  const found = new Map<string, string>();
  const seen = new Set<string>();
  for (const dir of ["server", "lib"]) {
    for (const file of sourceFiles(join(SRC, dir))) {
      if (seen.has(file)) continue;
      seen.add(file);
      if (/i18n|audit|logger/.test(file)) continue;
      const text = readFileSync(file, "utf8");
      const kind = file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
      const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, kind);
      const literal = (node: ts.Node | undefined) =>
        node && (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node))
          ? node.text
          : null;
      const add = (value: string | null) => {
        if (value && /[A-Za-z]{3,}/.test(value) && !found.has(value)) {
          found.set(value, file.replace(SRC, "src"));
        }
      };
      const visit = (node: ts.Node) => {
        if (
          ts.isNewExpression(node) &&
          ts.isIdentifier(node.expression) &&
          ERROR_CLASSES.has(node.expression.text)
        ) {
          add(literal(node.arguments?.[0]));
        }
        if (ts.isCallExpression(node) && ts.isIdentifier(node.expression)) {
          if (node.expression.text === "failureFrom") add(literal(node.arguments[2]));
          if (node.expression.text === "validationFailure") add(literal(node.arguments[0]));
        }
        if (
          ts.isCallExpression(node) &&
          ts.isPropertyAccessExpression(node.expression) &&
          ZOD_CHECKS.has(node.expression.name.text)
        ) {
          for (const arg of node.arguments) add(literal(arg));
        }
        if (ts.isPropertyAssignment(node) && node.name.getText(source) === "message") {
          add(literal(node.initializer));
        }
        ts.forEachChild(node, visit);
      };
      visit(source);
    }
  }
  return found;
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();

describe("Hindi coverage", () => {
  const sentences = new Map([...sentencesInCode(), ...serverMessages()]);

  it("finds the sentences in the code", () => {
    expect(sentences.size).toBeGreaterThan(500);
  });

  it("has a Hindi entry for every sentence the app asks to translate", () => {
    const missing = [...sentences].filter(([text]) => !(text in HI_MESSAGES));
    expect(
      missing.map(([text, file]) => `${file}: ${text}`),
      "add these to src/i18n/messages/hi.ts",
    ).toEqual([]);
  });

  it("has no Hindi entry that the code no longer uses", () => {
    const stale = Object.keys(HI_MESSAGES).filter((text) => !sentences.has(text));
    expect(stale, "remove these from src/i18n/messages/hi.ts").toEqual([]);
  });

  it("keeps every {placeholder} in the translation", () => {
    const broken = Object.entries(HI_MESSAGES)
      .filter(([en, hi]) => placeholders(en).join() !== placeholders(hi).join())
      .map(([en]) => en);
    expect(broken).toEqual([]);
  });

  it("has no empty translation", () => {
    const empty = Object.entries(HI_MESSAGES)
      .filter(([, hi]) => hi.trim() === "")
      .map(([en]) => en);
    expect(empty).toEqual([]);
  });

  it("really is Hindi where it should be (contains Devanagari letters)", () => {
    // Format examples and codes (PAN, IFSC, coupon sample, email) stay as they are, and so do these
    // names that are the same in every language.
    const sameEverywhere = new Set([
      "GSTIN",
      "WhatsApp",
      "{date} IST",
      "IFSC",
      "CATALOG_MANAGER",
      "YEARLY-PRO",
    ]);
    const untranslated = Object.entries(HI_MESSAGES)
      .filter(
        ([en, hi]) =>
          en === hi && /[A-Za-z]{4,}/.test(en) && !/@|\d/.test(en) && !sameEverywhere.has(en),
      )
      .map(([en]) => en);
    expect(untranslated).toEqual([]);
  });
});

describe("translate()", () => {
  const messages = { "Hello {name}": "नमस्ते {name}", Plain: "सादा" };

  it("returns the translation, or the English sentence when there is none", () => {
    expect(translate(messages, "Plain")).toBe("सादा");
    expect(translate(messages, "Not translated")).toBe("Not translated");
  });

  it("fills placeholders, in the translation and in the fallback", () => {
    expect(translate(messages, "Hello {name}", { name: "Aarav" })).toBe("नमस्ते Aarav");
    expect(translate({}, "Hello {name}", { name: "Aarav" })).toBe("Hello Aarav");
  });

  it("leaves an unknown placeholder visible instead of printing undefined", () => {
    expect(translate({}, "Hello {name}", { other: 1 })).toBe("Hello {name}");
  });

  it("does not re-interpret placeholder-looking text inside values", () => {
    expect(translate({}, "Hi {name}", { name: "{x}" })).toBe("Hi {x}");
  });
});

describe("locales", () => {
  it("knows English and Hindi, with English as the default", () => {
    expect([...LOCALES]).toEqual(["en", "hi"]);
    expect(DEFAULT_LOCALE).toBe("en");
  });
  it("accepts only supported language codes", () => {
    expect(isLocale("hi")).toBe(true);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
    expect(isLocale("<script>")).toBe(false);
  });
});
