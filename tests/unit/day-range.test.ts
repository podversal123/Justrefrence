import { describe, expect, it } from "vitest";
import { dayRangeBounds, financialYearDays } from "@/lib/day-range";

describe("dayRangeBounds", () => {
  it("makes the end day inclusive by returning the start of the next day", () => {
    const b = dayRangeBounds("2026-04-01", "2026-04-30");
    expect(b.gte?.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(b.lt?.toISOString()).toBe("2026-05-01T00:00:00.000Z");
  });

  it("rolls over month and year ends", () => {
    expect(dayRangeBounds(undefined, "2026-12-31").lt?.toISOString()).toBe(
      "2027-01-01T00:00:00.000Z",
    );
    expect(dayRangeBounds(undefined, "2028-02-29").lt?.toISOString()).toBe(
      "2028-03-01T00:00:00.000Z",
    );
  });

  it("allows an open-ended range and ignores junk", () => {
    expect(dayRangeBounds("2026-01-01")).toEqual({ gte: new Date("2026-01-01T00:00:00.000Z") });
    expect(dayRangeBounds("garbage", "2026-13-45")).toEqual({});
    expect(dayRangeBounds()).toEqual({});
  });
});

describe("financialYearDays", () => {
  it("runs 1 April to 31 March", () => {
    expect(financialYearDays(2026)).toEqual({ from: "2026-04-01", to: "2027-03-31" });
  });
});
