import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Only repositories talk to the database. Pages, components, shared helpers, server actions and the business
 * rules ask a repository (or `runInTransaction` for a transaction), so every query lives in one place and can
 * be reviewed and tested. The few infrastructure readers under `src/server/lib` and `src/server/auth` (the
 * session, the site settings, the pricing config and the legal-page store) are not part of this rule yet.
 */

const ROOT = join(process.cwd(), "src");
const DB_HANDLE = /server\/lib\/prisma/;
const GENERATED_CLIENT = /generated\/prisma\/client/;

// Screens must not even import values from the generated client. The server layers may (error classes, JSON
// null markers, enums); they only may not import the database handle.
const GUARDED_LAYERS: { dir: string; forbidden: RegExp[] }[] = [
  { dir: "app", forbidden: [DB_HANDLE, GENERATED_CLIENT] },
  { dir: "components", forbidden: [DB_HANDLE, GENERATED_CLIENT] },
  { dir: "lib", forbidden: [DB_HANDLE, GENERATED_CLIENT] },
  { dir: "server/services", forbidden: [DB_HANDLE] },
  { dir: "server/domain", forbidden: [DB_HANDLE] },
];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });
}

describe("layering", () => {
  it("keeps database access out of pages, components, actions and business rules", () => {
    const offenders: string[] = [];
    for (const layer of GUARDED_LAYERS) {
      for (const file of sourceFiles(join(ROOT, layer.dir))) {
        const text = readFileSync(file, "utf8");
        // Importing only a TYPE from the generated client is fine; a value import is not.
        const importLines = text.split("\n").filter((line) => /^\s*import\b/.test(line));
        const bad = importLines.some(
          (line) =>
            layer.forbidden.some((pattern) => pattern.test(line)) &&
            !/^\s*import\s+type\b/.test(line),
        );
        if (bad) offenders.push(file.replace(ROOT, "src"));
      }
    }
    expect(offenders).toEqual([]);
  });
});
