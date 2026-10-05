import { describe, expect, it } from "vitest";
import {
  enumerateDayBuckets,
  isDateRangePreset,
  resolveDateRange,
} from "@/server/domain/dashboard/date-range";

describe("resolveDateRange", () => {
  it("resolves 7D to 7 days before now", () => {
    const now = new Date("2026-06-15T00:00:00Z");
    const range = resolveDateRange("7D", now);
    expect(range.from?.toISOString()).toBe("2026-06-08T00:00:00.000Z");
    expect(range.to).toBe(now);
  });

  it("resolves 30D and 90D proportionally", () => {
    const now = new Date("2026-06-15T00:00:00Z");
    expect(resolveDateRange("30D", now).from?.toISOString()).toBe("2026-05-16T00:00:00.000Z");
    expect(resolveDateRange("90D", now).from?.toISOString()).toBe("2026-03-17T00:00:00.000Z");
  });

  it("ALL has no lower bound", () => {
    const range = resolveDateRange("ALL", new Date());
    expect(range.from).toBeNull();
  });
});

describe("isDateRangePreset", () => {
  it("accepts valid presets", () => {
    expect(isDateRangePreset("7D")).toBe(true);
    expect(isDateRangePreset("ALL")).toBe(true);
  });

  it("rejects anything else", () => {
    expect(isDateRangePreset("1Y")).toBe(false);
    expect(isDateRangePreset(undefined)).toBe(false);
    expect(isDateRangePreset(7)).toBe(false);
  });
});

describe("enumerateDayBuckets", () => {
  it("produces one bucket per day inclusive of both ends", () => {
    const range = resolveDateRange("7D", new Date("2026-06-15T12:00:00Z"));
    const buckets = enumerateDayBuckets(range);
    expect(buckets[0]).toBe("2026-06-08");
    expect(buckets.at(-1)).toBe("2026-06-15");
    expect(buckets).toHaveLength(8);
  });

  it("caps an ALL range at maxDays so a chart never silently explodes", () => {
    const range = resolveDateRange("ALL", new Date("2026-06-15T00:00:00Z"));
    const buckets = enumerateDayBuckets(range, 10);
    expect(buckets).toHaveLength(10);
  });
});
