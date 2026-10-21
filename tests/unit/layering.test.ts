import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The screen layer (pages, components, shared helpers) must not talk to the database itself. It asks a
 * repository or a domain function, so every query lives in one place and can be reviewed and tested.
 */

const ROOT = join(process.cwd(), "src");
const SCREEN_LAYERS = ["app", "components", "lib"];
const FORBIDDEN = [/server\/lib\/prisma/, /generated\/prisma\/client/];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("layering", () => {
  it("keeps database access out of pages, components and shared helpers", () => {
    const offenders: string[] = [];
    for (const layer of SCREEN_LAYERS) {
      for (const file of sourceFiles(join(ROOT, layer))) {
        const text = readFileSync(file, "utf8");
        // Importing only a TYPE from the generated client is fine; a value import is not.
        const importsLines = text.split("\n").filter((line) => /^\s*import\b/.test(line));
        const bad = importsLines.some(
          (line) =>
            FORBIDDEN.some((pattern) => pattern.test(line)) && !/^\s*import\s+type\b/.test(line),
        );
        if (bad) offenders.push(file.replace(ROOT, "src"));
      }
    }
    expect(offenders).toEqual([]);
  });
});
