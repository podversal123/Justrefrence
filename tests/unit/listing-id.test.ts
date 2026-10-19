import { describe, expect, it } from "vitest";
import { formatListingId, parseListingId } from "@/server/domain/catalog/listing-id";

describe("formatListingId", () => {
  it("gives each kind its own prefix and pads to six digits", () => {
    expect(formatListingId("PRODUCT", 123n)).toBe("PRD-000123");
    expect(formatListingId("SERVICE", 45n)).toBe("SRV-000045");
    expect(formatListingId("PROJECT", 7)).toBe("PRJ-000007");
  });

  it("grows past six digits instead of wrapping or cutting", () => {
    expect(formatListingId("PRODUCT", 1_234_567n)).toBe("PRD-1234567");
  });

  it("accepts the string form the database driver may return", () => {
    expect(formatListingId("SERVICE", "9")).toBe("SRV-000009");
  });

  it("refuses a number that cannot be a listing number", () => {
    expect(() => formatListingId("PRODUCT", 0n)).toThrow(RangeError);
    expect(() => formatListingId("PRODUCT", -4)).toThrow(RangeError);
  });

  it("never gives two listings of the same kind the same ID", () => {
    const ids = new Set(Array.from({ length: 2000 }, (_, i) => formatListingId("PRODUCT", i + 1)));
    expect(ids.size).toBe(2000);
  });
});

describe("parseListingId", () => {
  it("reads back what formatListingId wrote", () => {
    expect(parseListingId("PRD-000123")).toEqual({ kind: "PRODUCT", seq: 123n });
    expect(parseListingId(formatListingId("PROJECT", 1_234_567n))).toEqual({
      kind: "PROJECT",
      seq: 1_234_567n,
    });
  });

  it("ignores case and surrounding spaces", () => {
    expect(parseListingId("  srv-000045 ")).toEqual({ kind: "SERVICE", seq: 45n });
  });

  it("rejects anything that is not a listing ID", () => {
    for (const bad of ["", "PRD", "PRD-", "PRD-abc", "XYZ-000001", "PRD-000000", "2815618218"]) {
      expect(parseListingId(bad), bad).toBeNull();
    }
  });
});
