import { describe, expect, it } from "vitest";
import { buildVendorOrderBy, buildVendorWhere } from "@/server/repositories/vendor-query";

describe("buildVendorWhere", () => {
  it("returns an empty filter when no search or status is given", () => {
    expect(buildVendorWhere({})).toEqual({});
  });

  it("filters by approval status", () => {
    expect(buildVendorWhere({ status: "PENDING" })).toEqual({ approvalStatus: "PENDING" });
  });

  it("builds a case-insensitive OR search across business name, email, and full name", () => {
    const where = buildVendorWhere({ search: "acme" });
    expect(where.OR).toEqual([
      { businessName: { contains: "acme", mode: "insensitive" } },
      { user: { email: { contains: "acme", mode: "insensitive" } } },
      { user: { fullName: { contains: "acme", mode: "insensitive" } } },
    ]);
  });

  it("ignores an empty search string", () => {
    const where = buildVendorWhere({ search: "" });
    expect(where.OR).toBeUndefined();
  });

  it("combines status and search filters", () => {
    const where = buildVendorWhere({ status: "APPROVED", search: "acme" });
    expect(where.approvalStatus).toBe("APPROVED");
    expect(where.OR).toBeDefined();
  });
});

describe("buildVendorOrderBy", () => {
  it("sorts by the requested field and direction", () => {
    expect(buildVendorOrderBy({ sortBy: "businessName", sortDir: "asc" })).toEqual({
      businessName: "asc",
    });
    expect(buildVendorOrderBy({ sortBy: "createdAt", sortDir: "desc" })).toEqual({
      createdAt: "desc",
    });
  });
});
