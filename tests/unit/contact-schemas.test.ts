import { describe, expect, it } from "vitest";
import { mobileSchema, optionalLandlineSchema, optionalMobileSchema } from "@/lib/schemas/contact";
import { optionalGstinSchema, optionalPanSchema } from "@/lib/schemas/tax-ids";

describe("mobileSchema", () => {
  it("accepts an international mobile with or without the plus", () => {
    expect(mobileSchema.safeParse("+919876543210").success).toBe(true);
    expect(mobileSchema.safeParse("919876543210").success).toBe(true);
  });

  it("rejects short, lettered or zero-leading numbers", () => {
    for (const bad of ["", "12345", "+0919876543210", "98765abcde", "+91 98765 43210"]) {
      expect(mobileSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("optionalMobileSchema", () => {
  it("treats empty as not provided and still validates a value", () => {
    expect(optionalMobileSchema.parse("")).toBeUndefined();
    expect(optionalMobileSchema.parse(undefined)).toBeUndefined();
    expect(optionalMobileSchema.safeParse("123").success).toBe(false);
  });
});

describe("optionalLandlineSchema", () => {
  it("accepts common landline formats", () => {
    for (const ok of [
      "011-23456789",
      "011 2345 6789",
      "+91 11 23456789",
      "(011) 23456789",
      "23456789",
    ]) {
      expect(optionalLandlineSchema.safeParse(ok).success).toBe(true);
    }
  });

  it("rejects letters and numbers that are too short or too long", () => {
    for (const bad of ["call me", "12345", "1234567890123456", "011-abc"]) {
      expect(optionalLandlineSchema.safeParse(bad).success).toBe(false);
    }
  });

  it("treats empty as not provided", () => {
    expect(optionalLandlineSchema.parse("")).toBeUndefined();
  });
});

describe("PAN and GSTIN", () => {
  it("normalizes to upper case and validates the format", () => {
    expect(optionalPanSchema.parse("abcde1234f")).toBe("ABCDE1234F");
    expect(optionalPanSchema.safeParse("ABCDE12345").success).toBe(false);
    expect(optionalGstinSchema.parse("29abcde1234f1z5")).toBe("29ABCDE1234F1Z5");
    expect(optionalGstinSchema.safeParse("29ABCDE1234F1Z").success).toBe(false);
  });

  it("treats empty as not provided", () => {
    expect(optionalPanSchema.parse("")).toBeUndefined();
    expect(optionalGstinSchema.parse(undefined)).toBeUndefined();
  });
});
