import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * createVendorOrder and product stock, with every repository replaced by fakes (no database here).
 * A normal product line must still reduce stock and refuse a sold-out product. A line that is not a
 * catalogue listing (an awarded bid) is marked `trackStock: false` and must never touch stock, since
 * there is no product row to reduce.
 */

vi.mock("server-only", () => ({}));

const mockDecrement = vi.fn();
vi.mock("@/server/repositories/commerce/order-repository", () => ({
  createOrder: vi.fn(async () => ({ id: "order-1", orderSeq: 1n })),
  createOrderItems: vi.fn(),
  createOrderStatusHistory: vi.fn(),
  decrementProductStock: mockDecrement,
  setOrderNumber: vi.fn(),
}));
vi.mock("@/server/repositories/commerce/coupon-repository", () => ({
  createCouponRedemption: vi.fn(),
}));
vi.mock("@/server/domain/commission/commission-service", () => ({
  createPendingCommissionsForOrder: vi.fn(),
}));

const { createVendorOrder } = await import("@/server/domain/commerce/order-creation");

const base = {
  checkoutId: "co-1",
  vendorId: "v-1",
  buyerId: "u-1",
  memberId: "m-1",
  discount: 0n,
  couponId: null,
  gstRateBps: 1800,
  platformFeeRateBps: 500,
};
const tx = {} as never;

beforeEach(() => {
  vi.clearAllMocks();
  mockDecrement.mockResolvedValue(true);
});

describe("createVendorOrder and stock", () => {
  it("reduces the stock of a product line, as before", async () => {
    await createVendorOrder(tx, {
      ...base,
      lines: [{ itemType: "PRODUCT", itemId: "p-1", title: "Chair", unitPrice: 1000n, qty: 3 }],
    });
    expect(mockDecrement).toHaveBeenCalledExactlyOnceWith(tx, "p-1", 3);
  });

  it("refuses a product that sold out in the meantime", async () => {
    mockDecrement.mockResolvedValue(false);
    await expect(
      createVendorOrder(tx, {
        ...base,
        lines: [{ itemType: "PRODUCT", itemId: "p-1", title: "Chair", unitPrice: 1000n, qty: 3 }],
      }),
    ).rejects.toThrow(/sold out/i);
  });

  it("does not touch stock for a line that is not a catalogue listing, even if it says PRODUCT", async () => {
    const result = await createVendorOrder(tx, {
      ...base,
      lines: [
        {
          itemType: "PRODUCT",
          itemId: "requirement-1",
          title: "50 office chairs",
          unitPrice: 799900n,
          qty: 50,
          trackStock: false,
        },
      ],
    });
    expect(mockDecrement).not.toHaveBeenCalled();
    expect(result.orderId).toBe("order-1");
  });

  it("still reduces stock for a service-free product line next to an untracked one", async () => {
    await createVendorOrder(tx, {
      ...base,
      lines: [
        { itemType: "PRODUCT", itemId: "p-1", title: "Chair", unitPrice: 1000n, qty: 1 },
        {
          itemType: "PRODUCT",
          itemId: "r-1",
          title: "Bid line",
          unitPrice: 500n,
          qty: 2,
          trackStock: false,
        },
      ],
    });
    expect(mockDecrement).toHaveBeenCalledTimes(1);
    expect(mockDecrement).toHaveBeenCalledWith(tx, "p-1", 1);
  });
});
