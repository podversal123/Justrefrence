/**
 * Pure helpers for change requests (no I/O): turning "current values" and "proposed values" into
 * the short before/after list a reviewer reads. Every value is a display string, or null for
 * "empty", so a member's PAN, a price and a title are all compared the same way.
 */

export interface FieldSpec {
  key: string;
  label: string;
}

export interface DiffEntry {
  field: string;
  label: string;
  from: string | null;
  to: string | null;
}

export type FieldValues = Record<string, string | null>;

/** "" and null both mean "nothing entered"; surrounding spaces do not count as a change. */
export function normalizeValue(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Only the fields whose value actually changed, in the order the fields are declared. */
export function buildDiff(
  fields: readonly FieldSpec[],
  current: FieldValues,
  proposed: FieldValues,
): DiffEntry[] {
  const entries: DiffEntry[] = [];
  for (const { key, label } of fields) {
    if (!(key in proposed)) continue;
    const from = normalizeValue(current[key]);
    const to = normalizeValue(proposed[key]);
    if (from !== to) entries.push({ field: key, label, from, to });
  }
  return entries;
}

/** The record to apply: just the changed fields, taken from the proposal. */
export function proposedFromDiff(diff: readonly DiffEntry[]): FieldValues {
  return Object.fromEntries(diff.map((d) => [d.field, d.to]));
}

/** One pending request per record: this key is unique in the database while a request is pending. */
export function pendingKey(entityType: string, entityId: string): string {
  return `${entityType}:${entityId}`;
}

/**
 * Fields whose current value is no longer what the request saw. If any exist, the record was
 * changed after the request was made and approving it would silently overwrite that newer change.
 * Compares only the requested fields, so unrelated edits to the record never block an approval.
 */
export function findConflicts(diff: readonly DiffEntry[], currentDisplay: FieldValues): string[] {
  return diff
    .filter((d) => normalizeValue(currentDisplay[d.field]) !== normalizeValue(d.from))
    .map((d) => d.label);
}
