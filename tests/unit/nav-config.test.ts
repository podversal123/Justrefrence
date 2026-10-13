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
