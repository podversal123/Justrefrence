import { describe, expect, it } from "vitest";
import { canManageListing } from "@/server/domain/catalog/ownership";

describe("canManageListing — Phase 3 'do not allow a vendor to manage another vendor's listings'", () => {
  it("staff (no vendor profile of their own) can manage any listing", () => {
    expect(canManageListing(null, "any-vendor-id")).toBe(true);
  });

  it("a vendor can manage their own listing", () => {
    expect(canManageListing("vendor-a", "vendor-a")).toBe(true);
  });

  it("a vendor CANNOT manage another vendor's listing", () => {
    expect(canManageListing("vendor-a", "vendor-b")).toBe(false);
  });
});
