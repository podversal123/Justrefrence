import { describe, expect, it } from "vitest";
import { buildListingOrderBy, buildListingWhere } from "@/server/repositories/catalog/query";

describe("buildListingWhere", () => {
  it("always excludes soft-deleted rows", () => {
    expect(buildListingWhere({})).toEqual({ deletedAt: null });
  });

  it("filters by category and subcategory", () => {
    const where = buildListingWhere({ categoryId: "cat-1", subcategoryId: "sub-1" });
    expect(where).toMatchObject({ categoryId: "cat-1", subcategoryId: "sub-1" });
  });

  it("builds a case-insensitive OR search across title and description", () => {
    const where = buildListingWhere({ search: "widget" });
    expect(where.OR).toEqual([
      { title: { contains: "widget", mode: "insensitive" } },
      { description: { contains: "widget", mode: "insensitive" } },
    ]);
  });

  it("ignores an empty search string", () => {
    expect(buildListingWhere({ search: "" }).OR).toBeUndefined();
  });

  describe("public browsing", () => {
    it("forces APPROVED + isActive regardless of any status filter passed in", () => {
      const where = buildListingWhere(
        { approvalStatus: "PENDING", isActive: false },
        { publicOnly: true },
      );
      expect(where.approvalStatus).toBe("APPROVED");
      expect(where.isActive).toBe(true);
    });

    it("respects an explicit status/active filter when NOT public-only (admin/vendor views)", () => {
      const where = buildListingWhere({ approvalStatus: "PENDING", isActive: false });
      expect(where.approvalStatus).toBe("PENDING");
      expect(where.isActive).toBe(false);
    });
  });

  describe("vendor scoping", () => {
    it("scopes to the given vendor regardless of any vendorId in the query (ownership hardening)", () => {
      const where = buildListingWhere(
        { vendorId: "someone-elses-vendor-id" },
        { scopeToVendorId: "my-vendor-id" },
      );
      expect(where.vendorId).toBe("my-vendor-id");
    });

    it("falls back to the query's vendorId when no scope is forced (admin filtering by vendor)", () => {
      const where = buildListingWhere({ vendorId: "vendor-x" });
      expect(where.vendorId).toBe("vendor-x");
    });
  });
});

describe("buildListingOrderBy", () => {
  it("sorts by the requested field and direction", () => {
    expect(buildListingOrderBy({ sortBy: "price", sortDir: "asc" })).toEqual({ price: "asc" });
    expect(buildListingOrderBy({ sortBy: "createdAt", sortDir: "desc" })).toEqual({
      createdAt: "desc",
    });
  });
});

describe("buildListingWhere with a typed listing ID", () => {
  it("matches exactly that listing in a list of the same kind, and skips the word search", () => {
    const where = buildListingWhere({ search: "PRD-000123" }, { kind: "PRODUCT" });
    expect(where.listingSeq).toBe(123n);
    expect(where.OR).toBeUndefined();
  });

  it("ignores case and spaces", () => {
    expect(buildListingWhere({ search: " prd-000007 " }, { kind: "PRODUCT" }).listingSeq).toBe(7n);
  });

  it("finds nothing in a list of another kind", () => {
    expect(buildListingWhere({ search: "PRD-000123" }, { kind: "SERVICE" }).listingSeq).toBe(-1n);
  });

  it("treats ordinary words as before, and does nothing special without a kind", () => {
    expect(buildListingWhere({ search: "widget" }, { kind: "PRODUCT" }).OR).toHaveLength(2);
    expect(buildListingWhere({ search: "PRD-000123" }).listingSeq).toBeUndefined();
  });
});
