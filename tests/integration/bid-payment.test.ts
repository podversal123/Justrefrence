import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Paying for an awarded bid (claimAwardedBid). Orchestration is real; the database client and the order
 * code are fakes (no database here). Covers who may pay, the once-only guard, the replay of a double
 * click, and that the order is made at the winning price without touching product stock.
 */

vi.mock("server-only", () => ({}));

const mockCreateVendorOrder = vi.fn();
vi.mock("@/server/domain/commerce/order-creation", () => ({ createVendorOrder: mockCreateVendorOrder }));

const mockInvoice = vi.fn();
vi.mock("@/server/domain/commerce/invoice-service", () => ({ generateInvoiceForOrder: mockInvoice }));

vi.mock("@/server/repositories/commerce/order-repository", () => ({
  createCheckout: vi.fn(async () => ({ id: "checkout-1" })),
  markCartCheckedOut: vi.fn(),
}));
vi.mock("@/server/lib/pricing-config", () => ({
  getPricingConfig: vi.fn(async () => ({ gstRateBps: 1800, platformFeeRateBps: 500 })),
}));

const BUYER = "buyer-1";
const baseRequirement = {
  id: "req-1",
  reqSeq: 7n,
  buyerId: BUYER,
  title: "Annual IT support",
  status: "AWARDED",
  checkoutId: null as string | null,
  itemKind: "SERVICE",
  quantity: 3,
  awardedBid: { id: "bid-1", unitPrice: 50_000n, vendorId: "vendor-1", vendor: { userId: "vendor-user" } },
};

const mockRequirementFind = vi.fn();
const mockCheckoutFind = vi.fn();
const mockClaim = vi.fn();
const mockCartCreate = vi.fn();
const prismaMock = {
  requirement: { findUnique: mockRequirementFind, updateMany: mockClaim },
  checkout: { findUnique: mockCheckoutFind },
  cart: { create: mockCartCreate },
  $transaction: vi.fn(async (run: (tx: unknown) => unknown) => run(prismaMock)),
};
vi.mock("@/server/lib/prisma", () => ({ prisma: prismaMock }));

const { claimAwardedBid } = await import("@/server/domain/bidding/bidding-service");

const claim = (over: Partial<{ buyerUserId: string }> = {}) =>
  claimAwardedBid({ requirementId: "req-1", buyerUserId: BUYER, memberId: "member-profile-1", ...over });

beforeEach(() => {
  vi.clearAllMocks();
  mockRequirementFind.mockResolvedValue({ ...baseRequirement });
  mockCheckoutFind.mockResolvedValue(null);
  mockClaim.mockResolvedValue({ count: 1 });
  mockCartCreate.mockResolvedValue({ id: "cart-1" });
  mockCreateVendorOrder.mockResolvedValue({ orderId: "order-1" });
  mockInvoice.mockResolvedValue(undefined);
});

describe("claimAwardedBid", () => {
  it("makes one order at the winning price and quantity, without tracking product stock", async () => {
    const result = await claim();

    expect(result).toMatchObject({
      checkoutId: "checkout-1",
      orderId: "order-1",
      title: "Annual IT support",
      vendorUserId: "vendor-user",
    });
    expect(mockCreateVendorOrder).toHaveBeenCalledTimes(1);
    expect(mockCreateVendorOrder).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        vendorId: "vendor-1",
        buyerId: BUYER,
        memberId: "member-profile-1",
        lines: [
          {
            itemType: "SERVICE",
            itemId: "req-1",
            title: "Annual IT support",
            unitPrice: 50_000n,
            qty: 3,
            trackStock: false,
          },
        ],
      }),
    );
    expect(mockInvoice).toHaveBeenCalledWith("order-1");
  });

  it("remembers the checkout on the requirement only while it is still unpaid and awarded", async () => {
    await claim();
    expect(mockClaim).toHaveBeenCalledWith({
      where: { id: "req-1", buyerId: BUYER, status: "AWARDED", checkoutId: null },
      data: { checkoutId: "checkout-1" },
    });
  });

  it("answers 'not found' to anyone but the buyer who posted it", async () => {
    await expect(claim({ buyerUserId: "someone-else" })).rejects.toThrow(/not found/i);
    expect(mockCreateVendorOrder).not.toHaveBeenCalled();
  });

  it("answers 'not found' for a requirement that does not exist", async () => {
    mockRequirementFind.mockResolvedValue(null);
    await expect(claim()).rejects.toThrow(/not found/i);
  });

  it("refuses a requirement that has not been awarded", async () => {
    mockRequirementFind.mockResolvedValue({ ...baseRequirement, status: "OPEN", awardedBid: null });
    await expect(claim()).rejects.toThrow(/no awarded offer/i);
    expect(mockCreateVendorOrder).not.toHaveBeenCalled();
  });

  it("refuses one that was already paid for", async () => {
    mockRequirementFind.mockResolvedValue({ ...baseRequirement, checkoutId: "checkout-old" });
    await expect(claim()).rejects.toThrow(/already been paid/i);
    expect(mockCreateVendorOrder).not.toHaveBeenCalled();
  });

  it("returns the order already made when the same buyer presses pay again", async () => {
    mockCheckoutFind.mockResolvedValue({ id: "checkout-1", orders: [{ id: "order-1" }] });

    const result = await claim();

    expect(result.orderId).toBe("order-1");
    expect(mockCreateVendorOrder).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("loses a race cleanly: the once-only update matches nothing and no order is made", async () => {
    mockClaim.mockResolvedValue({ count: 0 });

    await expect(claim()).rejects.toThrow(/already been paid/i);

    expect(mockCreateVendorOrder).not.toHaveBeenCalled();
  });

  it("answers a simultaneous duplicate with the winner's order", async () => {
    mockCartCreate.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    mockCheckoutFind
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "checkout-w", orders: [{ id: "order-w" }] });

    const result = await claim();

    expect(result).toMatchObject({ checkoutId: "checkout-w", orderId: "order-w" });
  });

  it("keeps the order when the invoice cannot be made", async () => {
    mockInvoice.mockRejectedValue(new Error("pdf service down"));

    const result = await claim();

    expect(result.orderId).toBe("order-1");
  });
});
