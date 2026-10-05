import { describe, expect, it, vi } from "vitest";

/**
 * "Unauthorized order access" — order-service.ts's resolveActorRole()/
 * canViewOrder() are the structural ownership checks behind both order
 * detail viewing and status transitions. They're pure functions (no I/O),
 * but order-service.ts also statically imports order-repository.ts and
 * audit/record.ts (both "server-only"), so those still need the same
 * module-boundary mock treatment as everywhere else — see
 * tests/integration/registration-actions.test.ts.
 */

vi.mock("@/server/domain/audit/record", () => ({ recordAudit: vi.fn() }));
vi.mock("@/server/repositories/commerce/order-repository", () => ({
  getOrderDetail: vi.fn(),
  updateOrderStatus: vi.fn(),
  createOrderStatusHistory: vi.fn(),
}));
vi.mock("@/server/domain/commission/commission-service", () => ({
  promoteCommissionsForCompletedOrder: vi.fn(),
  reverseOrCancelCommissionsForOrder: vi.fn(),
}));
vi.mock("@/server/lib/prisma", () => ({
  prisma: { $transaction: vi.fn(async (fn: (tx: unknown) => unknown) => fn({})) },
}));

const { canViewOrder, resolveActorRole, transitionOrderStatus } = await import(
  "@/server/domain/commerce/order-service"
);

const BUYER_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_USER_ID = "22222222-2222-4222-8222-222222222222";
const VENDOR_PROFILE_ID = "33333333-3333-4333-8333-333333333333";
const OTHER_VENDOR_PROFILE_ID = "44444444-4444-4444-8444-444444444444";

const order = { vendorId: VENDOR_PROFILE_ID, buyerId: BUYER_ID, vendor: { userId: "vendor-user-1" } };

describe("canViewOrder", () => {
  it("allows the buyer to view their own order", () => {
    expect(canViewOrder({ userId: BUYER_ID, roles: ["CUSTOMER"], vendorProfileId: null }, order)).toBe(
      true,
    );
  });

  it("allows the owning vendor to view it", () => {
    expect(
      canViewOrder({ userId: "vendor-user-1", roles: ["VENDOR"], vendorProfileId: VENDOR_PROFILE_ID }, order),
    ).toBe(true);
  });

  it("allows staff (ADMIN/FINANCE/SUPPORT) regardless of ownership", () => {
    expect(canViewOrder({ userId: OTHER_USER_ID, roles: ["ADMIN"], vendorProfileId: null }, order)).toBe(
      true,
    );
    expect(
      canViewOrder({ userId: OTHER_USER_ID, roles: ["FINANCE"], vendorProfileId: null }, order),
    ).toBe(true);
  });

  it("denies an unrelated customer", () => {
    expect(
      canViewOrder({ userId: OTHER_USER_ID, roles: ["CUSTOMER"], vendorProfileId: null }, order),
    ).toBe(false);
  });

  it("denies a vendor who doesn't own this order", () => {
    expect(
      canViewOrder(
        { userId: "other-vendor-user", roles: ["VENDOR"], vendorProfileId: OTHER_VENDOR_PROFILE_ID },
        order,
      ),
    ).toBe(false);
  });
});

describe("resolveActorRole", () => {
  it("throws for an actor with no relationship to the order at all", () => {
    expect(() =>
      resolveActorRole({ userId: OTHER_USER_ID, roles: ["CUSTOMER"], vendorProfileId: null }, order),
    ).toThrow();
  });

  it("resolves the buyer as CUSTOMER, owner", () => {
    expect(resolveActorRole({ userId: BUYER_ID, roles: ["CUSTOMER"], vendorProfileId: null }, order)).toEqual(
      { role: "CUSTOMER", isOwner: true },
    );
  });

  it("resolves a non-owning vendor to AuthorizationError, not a false-owner VENDOR role", () => {
    expect(() =>
      resolveActorRole(
        { userId: "other-vendor-user", roles: ["VENDOR"], vendorProfileId: OTHER_VENDOR_PROFILE_ID },
        order,
      ),
    ).toThrow();
  });
});

describe("transitionOrderStatus — unauthorized access end to end", () => {
  it("rejects a status-change attempt from a user who is neither the buyer, the vendor, nor staff", async () => {
    const { getOrderDetail } = await import("@/server/repositories/commerce/order-repository");
    vi.mocked(getOrderDetail).mockResolvedValue({ ...order, status: "PLACED" } as never);

    await expect(
      transitionOrderStatus(
        "order-1",
        "CANCELLED",
        { userId: OTHER_USER_ID, roles: ["CUSTOMER"], vendorProfileId: null },
      ),
    ).rejects.toThrow();
  });

  it("404s when the order doesn't exist, rather than leaking any state about it", async () => {
    const { getOrderDetail } = await import("@/server/repositories/commerce/order-repository");
    vi.mocked(getOrderDetail).mockResolvedValue(null);

    await expect(
      transitionOrderStatus("ghost-order", "CANCELLED", {
        userId: BUYER_ID,
        roles: ["CUSTOMER"],
        vendorProfileId: null,
      }),
    ).rejects.toThrow(/not found/i);
  });
});
