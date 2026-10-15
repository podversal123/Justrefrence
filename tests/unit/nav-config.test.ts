import { describe, expect, it } from "vitest";
import { NAV_GROUPS } from "@/components/layout/nav-config";
import type { Permission } from "@/server/auth/permissions";

const referralsItem = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.href === "/referrals")!;

describe("My referrals menu link", () => {
  const permissions = new Set<Permission>(["referral:read"]);

  it("shows for an account that has a member profile", () => {
    expect(
      referralsItem.visible({ permissions, hasVendorProfile: false, hasMemberProfile: true }),
    ).toBe(true);
  });

  it("is hidden for a vendor-only account, which has no referral code to show", () => {
    expect(
      referralsItem.visible({ permissions, hasVendorProfile: true, hasMemberProfile: false }),
    ).toBe(false);
  });

  it("is hidden without the referral permission", () => {
    expect(
      referralsItem.visible({
        permissions: new Set<Permission>(),
        hasVendorProfile: false,
        hasMemberProfile: true,
      }),
    ).toBe(false);
  });
});

describe("menu links whose page needs a member profile", () => {
  const cases: [string, Permission][] = [
    ["/my-auctions", "auction:bid"],
    ["/sms", "sms:read"],
    ["/earnings", "commission:read"],
    ["/referrals", "referral:read"],
  ];

  for (const [href, permission] of cases) {
    const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.href === href)!;
    const permissions = new Set<Permission>([permission]);

    it(`${href} is hidden for a vendor-only account, so the link never leads to a blocked page`, () => {
      expect(item.visible({ permissions, hasVendorProfile: true, hasMemberProfile: false })).toBe(
        false,
      );
    });

    it(`${href} shows for an account with a member profile`, () => {
      expect(item.visible({ permissions, hasVendorProfile: false, hasMemberProfile: true })).toBe(
        true,
      );
    });
  }
});

describe("which panel a menu link belongs to", () => {
  const items = NAV_GROUPS.flatMap((g) => g.items);
  const panelsOf = (href: string) => items.find((i) => i.href === href)?.panels;

  it("keeps buying and referral links in the Member panel only", () => {
    for (const href of ["/cart", "/orders", "/referrals", "/earnings", "/coupons", "/rewards"]) {
      expect(panelsOf(href), href).toEqual(["CUSTOMER"]);
    }
  });

  it("keeps selling links in the Seller / Vendor panel only", () => {
    for (const href of [
      "/vendor/orders",
      "/bids",
      "/vendor/auctions",
      "/vendor/ads",
      "/vendor/profile",
      "/vendor/catalog/products",
    ]) {
      expect(panelsOf(href), href).toEqual(["VENDOR"]);
    }
  });

  it("shows money and help links in both panels", () => {
    for (const href of ["/wallet", "/account-report", "/invoices", "/messages", "/support"]) {
      expect(panelsOf(href), href).toEqual(["CUSTOMER", "VENDOR"]);
    }
  });
});

describe("Become a seller menu link", () => {
  const item = NAV_GROUPS.flatMap((g) => g.items).find((i) => (i.href as string) === "/become-seller")!;
  const base = { hasVendorProfile: false, hasMemberProfile: true };
  const apply = new Set<Permission>(["vendor:apply"]);

  it("shows for a member who is not a seller yet", () => {
    expect(item.visible({ ...base, permissions: apply, roles: ["CUSTOMER"] })).toBe(true);
  });

  it("stays visible while a request is pending, so the member can see its status", () => {
    expect(
      item.visible({ ...base, hasVendorProfile: true, permissions: apply, roles: ["CUSTOMER"] }),
    ).toBe(true);
  });

  it("disappears once the member is an approved seller", () => {
    expect(item.visible({ ...base, permissions: apply, roles: ["CUSTOMER", "VENDOR"] })).toBe(false);
  });

  it("is hidden without the apply permission or a member profile", () => {
    expect(item.visible({ ...base, permissions: new Set<Permission>(), roles: ["CUSTOMER"] })).toBe(false);
    expect(
      item.visible({ ...base, hasMemberProfile: false, permissions: apply, roles: ["CUSTOMER"] }),
    ).toBe(false);
  });
});
