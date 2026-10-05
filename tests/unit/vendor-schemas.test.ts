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
    });
    expect(result.success).toBe(true);
  });

  it("rejects a one-character business name", () => {
    const result = createVendorSchema.safeParse({
      email: "vendor@example.com",
      businessName: "A",
      fullName: "Jane Vendor",
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
  it("requires a non-trivial business name", () => {
    expect(updateVendorProfileSchema.safeParse({ businessName: "" }).success).toBe(false);
    expect(updateVendorProfileSchema.safeParse({ businessName: "Acme" }).success).toBe(true);
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
