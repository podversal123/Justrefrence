import { describe, expect, it } from "vitest";
import { describeRoles, getPanel, isStaff, roleLabel } from "@/server/auth/panel";

describe("getPanel", () => {
  it("puts every staff role in the admin panel", () => {
    for (const role of ["SUPER_ADMIN", "ADMIN", "FINANCE", "SUPPORT"]) {
      expect(getPanel({ roles: [role], hasVendorProfile: false })).toBe("ADMIN");
    }
  });

  it("treats a custom role built by an admin as staff", () => {
    expect(getPanel({ roles: ["CONTENT_EDITOR"], hasVendorProfile: false })).toBe("ADMIN");
    expect(isStaff({ roles: ["CONTENT_EDITOR"] })).toBe(true);
  });

  it("puts vendors in the vendor panel and everyone else in the customer panel", () => {
    expect(getPanel({ roles: ["VENDOR"], hasVendorProfile: true })).toBe("VENDOR");
    expect(getPanel({ roles: ["VENDOR"], hasVendorProfile: false })).toBe("VENDOR");
    expect(getPanel({ roles: ["CUSTOMER"], hasVendorProfile: false })).toBe("CUSTOMER");
    expect(getPanel({ roles: [], hasVendorProfile: false })).toBe("CUSTOMER");
  });

  it("lets staff win when a person is both staff and a customer", () => {
    expect(getPanel({ roles: ["CUSTOMER", "ADMIN"], hasVendorProfile: false })).toBe("ADMIN");
  });
});

describe("roleLabel / describeRoles", () => {
  it("shows plain names, never raw role codes", () => {
    expect(roleLabel("SUPER_ADMIN")).toBe("Super Admin");
    expect(roleLabel("CONTENT_EDITOR")).toBe("Content Editor");
    expect(describeRoles(["SUPER_ADMIN"])).toBe("Super Admin");
  });

  it("lists staff roles before customer or vendor roles", () => {
    expect(describeRoles(["CUSTOMER", "ADMIN"])).toBe("Admin, Customer");
  });

  it("says so when there is no role", () => {
    expect(describeRoles([])).toBe("No role assigned");
  });
});
