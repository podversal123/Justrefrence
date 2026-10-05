/**
 * Pure date-range resolution for the admin dashboard's date filter — no
 * I/O. `to` is always "now" (inclusive); `from` is null for "ALL" (no
 * lower bound).
 */

export const DATE_RANGE_PRESETS = ["7D", "30D", "90D", "ALL"] as const;
export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

export function isDateRangePreset(value: unknown): value is DateRangePreset {
  return typeof value === "string" && (DATE_RANGE_PRESETS as readonly string[]).includes(value);
}

export interface ResolvedDateRange {
  from: Date | null;
  to: Date;
  preset: DateRangePreset;
}

const PRESET_DAYS: Record<Exclude<DateRangePreset, "ALL">, number> = {
  "7D": 7,
  "30D": 30,
  "90D": 90,
};

export function resolveDateRange(preset: DateRangePreset, now: Date = new Date()): ResolvedDateRange {
  if (preset === "ALL") {
    return { from: null, to: now, preset };
  }
  const days = PRESET_DAYS[preset];
  return { from: new Date(now.getTime() - days * 24 * 60 * 60 * 1000), to: now, preset };
}

/** Day-bucket keys (YYYY-MM-DD, UTC) spanning a resolved range — used to zero-fill chart series so a day with no activity still plots as 0, not a gap. */
export function enumerateDayBuckets(range: ResolvedDateRange, maxDays = 90): string[] {
  const from = range.from ?? new Date(range.to.getTime() - maxDays * 24 * 60 * 60 * 1000);
  const days: string[] = [];
  const cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate()));
  const end = new Date(Date.UTC(range.to.getUTCFullYear(), range.to.getUTCMonth(), range.to.getUTCDate()));

  while (cursor.getTime() <= end.getTime() && days.length < maxDays) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}
