import { describe, expect, it } from "vitest";
import {
  createVendorSchema,
  updateVendorStatusSchema,
  updateVendorProfileSchema,
  vendorListQuerySchema,
} from "@/lib/schemas/vendor";

describe("createVendorSchema", () => {
  it("accepts a valid payload", () => {
    const result = createVendorSchema.safeParse({
      email: "vendor@example.com",
      businessName: "Acme Co",
      fullName: "Jane Vendor",
      phone: "+919876543210",
    });
    expect(result.success).toBe(true);
  });

  it("requires a valid mobile number with country code", () => {
    const base = { email: "vendor@example.com", businessName: "Acme Co", fullName: "Jane Vendor" };
    expect(createVendorSchema.safeParse(base).success).toBe(false);
    expect(createVendorSchema.safeParse({ ...base, phone: "12345" }).success).toBe(false);
    expect(createVendorSchema.safeParse({ ...base, phone: "+919876543210" }).success).toBe(true);
  });

  it("rejects a one-character business name", () => {
    const result = createVendorSchema.safeParse({
      email: "vendor@example.com",
      businessName: "A",
      fullName: "Jane Vendor",
      phone: "+919876543210",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateVendorStatusSchema", () => {
  it("requires a reason when rejecting", () => {
    const result = updateVendorStatusSchema.safeParse({ status: "REJECTED" });
    expect(result.success).toBe(false);
  });

  it("accepts a rejection with a reason", () => {
    const result = updateVendorStatusSchema.safeParse({
      status: "REJECTED",
      reason: "Incomplete KYC documents.",
    });
    expect(result.success).toBe(true);
  });

  it("does not require a reason to approve", () => {
    const result = updateVendorStatusSchema.safeParse({ status: "APPROVED" });
    expect(result.success).toBe(true);
  });

  it("rejects PENDING as a target status (not a valid transition target)", () => {
    const result = updateVendorStatusSchema.safeParse({ status: "PENDING" });
    expect(result.success).toBe(false);
  });
});

describe("updateVendorProfileSchema", () => {
  const base = { businessName: "Acme", phone: "+919876543210" };

  it("requires a non-trivial business name", () => {
    expect(updateVendorProfileSchema.safeParse({ ...base, businessName: "" }).success).toBe(false);
    expect(updateVendorProfileSchema.safeParse(base).success).toBe(true);
  });

  it("requires the business mobile but keeps telephone, GSTIN and PAN optional", () => {
    expect(updateVendorProfileSchema.safeParse({ businessName: "Acme" }).success).toBe(false);
    const ok = updateVendorProfileSchema.safeParse({ ...base, telephone: "", gstin: "", pan: "" });
    expect(ok.success).toBe(true);
    if (ok.success) {
      expect(ok.data.telephone).toBeUndefined();
      expect(ok.data.gstin).toBeUndefined();
      expect(ok.data.pan).toBeUndefined();
    }
  });

  it("validates telephone, GSTIN and PAN formats", () => {
    expect(
      updateVendorProfileSchema.safeParse({ ...base, telephone: "011-2345 6789" }).success,
    ).toBe(true);
    expect(updateVendorProfileSchema.safeParse({ ...base, telephone: "abc" }).success).toBe(false);
    expect(updateVendorProfileSchema.safeParse({ ...base, pan: "abcde1234f" }).success).toBe(true);
    expect(updateVendorProfileSchema.safeParse({ ...base, pan: "BAD" }).success).toBe(false);
    expect(updateVendorProfileSchema.safeParse({ ...base, gstin: "12" }).success).toBe(false);
  });
});

describe("vendorListQuerySchema", () => {
  it("applies defaults when given an empty query", () => {
    const result = vendorListQuerySchema.parse({});
    expect(result).toMatchObject({ sortBy: "createdAt", sortDir: "desc", limit: 20 });
  });

  it("coerces a string limit and caps it at 100", () => {
    expect(vendorListQuerySchema.parse({ limit: "50" }).limit).toBe(50);
    expect(vendorListQuerySchema.safeParse({ limit: "500" }).success).toBe(false);
  });

  it("rejects an invalid status filter", () => {
    expect(vendorListQuerySchema.safeParse({ status: "NOT_A_STATUS" }).success).toBe(false);
  });
});
