import { describe, expect, it } from "vitest";
import {
  canSwitchPanel,
  describeRoles,
  getPanel,
  isSeller,
  isStaff,
  panelLabelFor,
  roleLabel,
} from "@/server/auth/panel";

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
    expect(describeRoles(["CUSTOMER", "ADMIN"])).toBe("Admin, Member");
  });

  it("says so when there is no role", () => {
    expect(describeRoles([])).toBe("No role assigned");
  });
});

describe("the four panels", () => {
  it("shows Super Admin its own panel name and Admin the Admin panel", () => {
    expect(panelLabelFor({ roles: ["SUPER_ADMIN"], hasVendorProfile: false })).toBe(
      "Super Admin panel",
    );
    expect(panelLabelFor({ roles: ["ADMIN"], hasVendorProfile: false })).toBe("Admin panel");
    expect(panelLabelFor({ roles: ["CUSTOMER"], hasVendorProfile: false })).toBe("Member panel");
    expect(panelLabelFor({ roles: ["VENDOR"], hasVendorProfile: true })).toBe(
      "Seller / Vendor panel",
    );
  });

  it("keeps someone with a pending seller request in the Member panel", () => {
    // The request creates a vendor profile at once, but the VENDOR role only comes with approval.
    const pending = { roles: ["CUSTOMER"], hasVendorProfile: true, hasMemberProfile: true };
    expect(getPanel(pending)).toBe("CUSTOMER");
    expect(isSeller(pending)).toBe(false);
    expect(canSwitchPanel(pending)).toBe(false);
  });

  it("lets an approved seller who is also a member switch, defaulting to the Member panel", () => {
    const both = { roles: ["CUSTOMER", "VENDOR"], hasVendorProfile: true, hasMemberProfile: true };
    expect(canSwitchPanel(both)).toBe(true);
    expect(getPanel(both)).toBe("CUSTOMER");
    expect(getPanel({ ...both, preferredPanel: "VENDOR" })).toBe("VENDOR");
    expect(getPanel({ ...both, preferredPanel: "CUSTOMER" })).toBe("CUSTOMER");
  });

  it("gives a seller with no member profile only the Seller / Vendor panel, whatever the cookie says", () => {
    const sellerOnly = { roles: ["VENDOR"], hasVendorProfile: true, hasMemberProfile: false };
    expect(canSwitchPanel(sellerOnly)).toBe(false);
    expect(getPanel({ ...sellerOnly, preferredPanel: "CUSTOMER" })).toBe("VENDOR");
  });

  it("ignores the saved choice for a member who is not a seller", () => {
    const member = { roles: ["CUSTOMER"], hasVendorProfile: false, hasMemberProfile: true };
    expect(getPanel({ ...member, preferredPanel: "VENDOR" })).toBe("CUSTOMER");
  });

  it("never offers staff a switch", () => {
    const staff = { roles: ["ADMIN", "VENDOR"], hasVendorProfile: true, hasMemberProfile: true };
    expect(canSwitchPanel(staff)).toBe(false);
    expect(getPanel({ ...staff, preferredPanel: "VENDOR" })).toBe("ADMIN");
  });
});
