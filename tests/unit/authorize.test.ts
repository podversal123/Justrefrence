import { describe, expect, it } from "vitest";
import { evaluateAuthorization } from "@/server/auth/evaluate-authorization";
import { AccountBlockedError, AuthenticationError, AuthorizationError } from "@/server/lib/errors";
import type { AuthSession } from "@/server/auth/session";
import type { Permission } from "@/server/auth/permissions";

function makeSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    userId: "user-1",
    email: "member@example.com",
    fullName: null,
    status: "ACTIVE",
    roles: ["CUSTOMER"],
    permissions: new Set<Permission>(["order:read", "wallet:read"]),
    hasVendorProfile: false,
    vendorProfileId: null,
    ...overrides,
  };
}

describe("evaluateAuthorization", () => {
  it("denies an unauthenticated caller", () => {
    expect(() => evaluateAuthorization(null, "order:read")).toThrow(AuthenticationError);
  });

  it("denies a blocked account even with the right permission", () => {
    const session = makeSession({ status: "BLOCKED" });
    expect(() => evaluateAuthorization(session, "order:read")).toThrow(AccountBlockedError);
  });

  it("denies a caller who lacks the permission", () => {
    const session = makeSession();
    expect(() => evaluateAuthorization(session, "payout:approve")).toThrow(AuthorizationError);
  });

  it("allows a caller who holds the permission", () => {
    const session = makeSession();
    expect(evaluateAuthorization(session, "order:read")).toBe(session);
  });

  it("denies access to another user's resource without an override permission", () => {
    const session = makeSession();
    expect(() =>
      evaluateAuthorization(session, "order:read", { resourceOwnerId: "someone-else" }),
    ).toThrow(AuthorizationError);
  });

  it("allows access to another user's resource when the override permission is held", () => {
    const session = makeSession({
      permissions: new Set<Permission>(["order:read", "order:read:any"]),
    });
    expect(
      evaluateAuthorization(session, "order:read", {
        resourceOwnerId: "someone-else",
        overridePermission: "order:read:any",
      }),
    ).toBe(session);
  });

  it("denies when a business-rule check fails", () => {
    const session = makeSession();
    expect(() =>
      evaluateAuthorization(session, "order:read", {
        businessRuleCheck: () => "Order is not in a cancellable state.",
      }),
    ).toThrow(AuthorizationError);
  });

  it("allows when a business-rule check passes", () => {
    const session = makeSession();
    expect(evaluateAuthorization(session, "order:read", { businessRuleCheck: () => true })).toBe(
      session,
    );
  });

  it("vendor accessing another vendor's order is denied (no order:read:any)", () => {
    const vendorA = makeSession({
      userId: "vendor-a",
      roles: ["VENDOR"],
      permissions: new Set<Permission>(["order:read", "order:update_status"]),
    });
    expect(() =>
      evaluateAuthorization(vendorA, "order:read", { resourceOwnerId: "vendor-b" }),
    ).toThrow(AuthorizationError);
  });

  // Phase 2: vendor/admin RBAC scenarios — see docs/rbac.md §4 and the
  // Phase 2 brief's "do not allow a vendor to access another vendor's
  // private resources" requirement.
  describe("Phase 2: vendor and role management", () => {
    function vendorSession(overrides: Partial<AuthSession> = {}): AuthSession {
      return makeSession({
        userId: "vendor-a",
        roles: ["VENDOR"],
        permissions: new Set<Permission>([
          "product:read",
          "order:read",
          "wallet:read",
          "member:read",
        ]),
        hasVendorProfile: true,
        vendorProfileId: "vendor-profile-a",
        ...overrides,
      });
    }

    it("a vendor cannot approve/reject/suspend any vendor, including themself", () => {
      const vendorA = vendorSession();
      for (const permission of ["vendor:approve", "vendor:reject", "vendor:suspend"] as const) {
        expect(() =>
          evaluateAuthorization(vendorA, permission, { resourceOwnerId: vendorA.userId }),
        ).toThrow(AuthorizationError);
      }
    });

    it("a vendor cannot read another vendor's member record without member:read:any", () => {
      const vendorA = vendorSession();
      expect(() =>
        evaluateAuthorization(vendorA, "member:read", { resourceOwnerId: "vendor-b" }),
      ).toThrow(AuthorizationError);
    });

    it("an admin with member:read:any can view any vendor's record", () => {
      const admin = makeSession({
        userId: "admin-1",
        roles: ["ADMIN"],
        permissions: new Set<Permission>(["member:read", "member:read:any"]),
      });
      expect(
        evaluateAuthorization(admin, "member:read", {
          resourceOwnerId: "vendor-b",
          overridePermission: "member:read:any",
        }),
      ).toBe(admin);
    });

    it("only SUPER_ADMIN-equivalent permission holders can assign roles", () => {
      const vendorA = vendorSession();
      expect(() => evaluateAuthorization(vendorA, "role:assign")).toThrow(AuthorizationError);

      const superAdmin = makeSession({
        roles: ["SUPER_ADMIN"],
        permissions: new Set<Permission>(["role:assign", "permission:update"]),
      });
      expect(evaluateAuthorization(superAdmin, "role:assign")).toBe(superAdmin);
    });
  });
});
