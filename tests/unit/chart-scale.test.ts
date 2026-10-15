import { describe, expect, it } from "vitest";
import { niceTicks } from "@/lib/chart-scale";
import { formatRupeesCompact } from "@/lib/money";

describe("niceTicks", () => {
  it("gives round steps that reach past the biggest value", () => {
    expect(niceTicks(250)).toEqual([0, 100, 200, 300, 400]);
    expect(niceTicks(8)).toEqual([0, 2, 4, 6, 8]);
    expect(niceTicks(5000)).toEqual([0, 2000, 4000, 6000, 8000]);
    expect(niceTicks(6)).toEqual([0, 2, 4, 6, 8]);
  });

  it("always starts at zero and ends at or above the data maximum", () => {
    for (const max of [1, 3, 7, 12, 49, 130, 999, 12345, 987654]) {
      const ticks = niceTicks(max);
      expect(ticks[0]).toBe(0);
      expect(ticks.at(-1)!).toBeGreaterThanOrEqual(max);
      expect(ticks).toHaveLength(5);
    }
  });

  it("copes with no data", () => {
    expect(niceTicks(0)).toEqual([0, 1]);
    expect(niceTicks(Number.NaN)).toEqual([0, 1]);
  });
});

describe("formatRupeesCompact", () => {
  it("writes short rupee amounts for chart labels", () => {
    expect(formatRupeesCompact(0)).toBe("₹0");
    expect(formatRupeesCompact(250)).toBe("₹250");
    expect(formatRupeesCompact(250.5)).toBe("₹250.5");
    expect(formatRupeesCompact(1200)).toBe("₹1.2K");
    expect(formatRupeesCompact(150000)).toBe("₹1.5L");
  });
});
