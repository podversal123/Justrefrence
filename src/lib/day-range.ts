/**
 * An inclusive calendar-day range from two YYYY-MM-DD strings (as the date inputs on the
 * admin filters send them) to the half-open UTC interval [gte, lt) a database query needs.
 * Pure, no I/O. Either bound may be missing; an unparseable bound is ignored.
 */
const DAY = /^\d{4}-\d{2}-\d{2}$/;

export interface DayRangeBounds {
  gte?: Date;
  lt?: Date;
}

function parseDay(value: string | undefined): Date | undefined {
  if (!value || !DAY.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? undefined : date;
}

export function dayRangeBounds(from?: string, to?: string): DayRangeBounds {
  const bounds: DayRangeBounds = {};
  const start = parseDay(from);
  if (start) bounds.gte = start;
  const end = parseDay(to);
  if (end) {
    end.setUTCDate(end.getUTCDate() + 1);
    bounds.lt = end;
  }
  return bounds;
}

/** First and last day (YYYY-MM-DD) of the Indian financial year that starts in `startYear`. */
export function financialYearDays(startYear: number): { from: string; to: string } {
  return { from: `${startYear}-04-01`, to: `${startYear + 1}-03-31` };
}
