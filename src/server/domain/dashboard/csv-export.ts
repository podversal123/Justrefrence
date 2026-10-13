/**
 * Pure CSV formatting — no I/O. RFC 4180-ish: fields containing a comma,
 * quote, or newline are wrapped in quotes with internal quotes doubled.
 */

/**
 * Spreadsheet apps run a cell as a formula when it starts with = + - @ (or a tab / carriage
 * return). Text that came from users (names, notes) must not be able to do that, so such
 * cells get a leading apostrophe. Opt-in, because it would also touch real negative numbers.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

function escapeCsvField(value: unknown, neutralizeFormulas = false): string {
  let str = value === null || value === undefined ? "" : String(value);
  if (neutralizeFormulas && FORMULA_START.test(str)) str = `'${str}`;
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(
  columns: string[],
  rows: unknown[][],
  options: { neutralizeFormulas?: boolean } = {},
): string {
  const neutralize = options.neutralizeFormulas ?? false;
  const lines = [columns.map((c) => escapeCsvField(c)).join(",")];
  for (const row of rows) {
    lines.push(row.map((v) => escapeCsvField(v, neutralize)).join(","));
  }
  return lines.join("\r\n");
}
