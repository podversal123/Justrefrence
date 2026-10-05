/**
 * Pure CSV formatting — no I/O. RFC 4180-ish: fields containing a comma,
 * quote, or newline are wrapped in quotes with internal quotes doubled.
 */

function escapeCsvField(value: unknown): string {
  const str = value === null || value === undefined ? "" : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function toCsv(columns: string[], rows: unknown[][]): string {
  const lines = [columns.map(escapeCsvField).join(",")];
  for (const row of rows) {
    lines.push(row.map(escapeCsvField).join(","));
  }
  return lines.join("\r\n");
}
