import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Integration-style tests for the core checkout/order-creation engine —
 * mocked at the repository/catalog-registry module boundary (all of which
 * carry "server-only"), same convention as
 * tests/integration/registration-actions.test.ts. The orchestration itself
 * (checkout-service.ts: price re-fetch, stock defense, multi-vendor split,
 * coupon allocation, idempotent replay) is REAL — this is what the Phase 5
 * brief's required test scenarios (price tampering, stock race, duplicate
 * checkout, invalid coupon, multi-vendor cart) actually exercise.
 */

const mockRecordAudit = vi.fn();
vi.mock("@/server/domain/audit/record", () => ({ recordAudit: mockRecordAudit }));

const mockGenerateInvoiceForOrder = vi.fn().mockResolvedValue(null);
vi.mock("@/server/domain/commerce/invoice-service", () => ({
  generateInvoiceForOrder: mockGenerateInvoiceForOrder,
}));

const mockCreatePendingCommissionsForOrder = vi.fn().mockResolvedValue(undefined);
vi.mock("@/server/domain/commission/commission-service", () => ({
  createPendingCommissionsForOrder: mockCreatePendingCommissionsForOrder,
  promoteCommissionsForCompletedOrder: vi.fn(),
  reverseOrCancelCommissionsForOrder: vi.fn(),
}));

const mockGetPricingConfig = vi.fn().mockResolvedValue({ gstRateBps: 0, platformFeeRateBps: 0 });
vi.mock("@/server/lib/pricing-config", () => ({ getPricingConfig: mockGetPricingConfig }));

const mockGetOpenCartWithItems = vi.fn();
const mockGetOrCreateOpenCart = vi.fn().mockResolvedValue({ id: "new-open-cart" });
vi.mock("@/server/repositories/commerce/cart-repository", () => ({
  getOpenCartWithItems: mockGetOpenCartWithItems,
  getOrCreateOpenCart: mockGetOrCreateOpenCart,
}));

const mockFindCouponByCode = vi.fn();
const mockGetCouponUsage = vi.fn().mockResolvedValue({ globalRedemptions: 0, memberRedemptions: 0 });
const mockCreateCouponRedemption = vi.fn();
vi.mock("@/server/repositories/commerce/coupon-repository", () => ({
  findCouponByCode: mockFindCouponByCode,
  getCouponUsage: mockGetCouponUsage,
  createCouponRedemption: mockCreateCouponRedemption,
}));

const mockFindCheckoutByIdempotencyKey = vi.fn().mockResolvedValue(null);
const mockCreateCheckout = vi.fn();
const mockDecrementProductStock = vi.fn().mockResolvedValue(true);
let orderSeqCounter = 0;
const mockCreateOrder = vi.fn(async (_tx: unknown, data: Record<string, unknown>) => {
  orderSeqCounter += 1;
  return { id: `order-${orderSeqCounter}`, orderSeq: BigInt(orderSeqCounter), ...data };
});
const mockSetOrderNumber = vi.fn();
const mockCreateOrderItems = vi.fn();
const mockCreateOrderStatusHistory = vi.fn();
const mockMarkCartCheckedOut = vi.fn();
vi.mock("@/server/repositories/commerce/order-repository", () => ({
  findCheckoutByIdempotencyKey: mockFindCheckoutByIdempotencyKey,
  createCheckout: mockCreateCheckout,
  decrementProductStock: mockDecrementProductStock,
  createOrder: mockCreateOrder,
  setOrderNumber: mockSetOrderNumber,
  createOrderItems: mockCreateOrderItems,
  createOrderStatusHistory: mockCreateOrderStatusHistory,
  markCartCheckedOut: mockMarkCartCheckedOut,
}));

const mockGetById = vi.fn();
vi.mock("@/server/repositories/catalog/registry", () => ({
  getCatalogRepository: vi.fn(() => ({ getById: mockGetById })),
}));

const prismaMock = {
  $transaction: vi.fn(async (arg: unknown) => {
    if (typeof arg === "function") return (arg as (tx: unknown) => unknown)(prismaMock);
    return Promise.all(arg as Promise<unknown>[]);
  }),
};
vi.mock("@/server/lib/prisma", () => ({ prisma: prismaMock }));

const { placeOrder } = await import("@/server/domain/commerce/checkout-service");

const BUYER_ID = "11111111-1111-4111-8111-111111111111";
const MEMBER_ID = "22222222-2222-4222-8222-222222222222";
const VENDOR_A = "33333333-3333-4333-8333-333333333333";
const VENDOR_B = "44444444-4444-4444-8444-444444444444";

function listing(overrides: Record<string, unknown> = {}) {
  return {
    id: "product-1",
    title: "Widget",
    deletedAt: null,
    approvalStatus: "APPROVED",
    isActive: true,
    price: 10000n,
    stock: 10,
    vendorId: VENDOR_A,
    vendor: { businessName: "Vendor A" },
    ...overrides,
  };
}

function cart(items: { itemType: string; itemId: string; qty: number }[]) {
  return { id: "cart-1", items };
}

beforeEach(() => {
  vi.clearAllMocks();
  orderSeqCounter = 0;
  mockFindCheckoutByIdempotencyKey.mockResolvedValue(null);
  mockDecrementProductStock.mockResolvedValue(true);
  mockGetPricingConfig.mockResolvedValue({ gstRateBps: 0, platformFeeRateBps: 0 });
  mockCreateCheckout.mockResolvedValue({ id: "checkout-1" });
  mockGetCouponUsage.mockResolvedValue({ globalRedemptions: 0, memberRedemptions: 0 });
  prismaMock.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === "function") return (arg as (tx: unknown) => unknown)(prismaMock);
    return Promise.all(arg as Promise<unknown>[]);
  });
});

describe("placeOrder — price tampering", () => {
  it("prices the order from the catalog's CURRENT price, never anything the cart item itself carries", async () => {
    mockGetOpenCartWithItems.mockResolvedValue(
      cart([{ itemType: "PRODUCT", itemId: "product-1", qty: 2 }]),
    );
    mockGetById.mockResolvedValue(listing({ price: 10000n }));

    await placeOrder(BUYER_ID, MEMBER_ID, { idempotencyKey: "idem-1" });

    expect(mockCreateOrder).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ subtotal: 20000n, grandTotal: 20000n }),
    );
  });

  it("charges the catalog's price even when it changed since the item was added to the cart", async () => {
    // The cart item only ever carries itemType/itemId/qty — there is no
    // price field on it for a tampered or stale value to hide in.
    mockGetOpenCartWithItems.mockResolvedValue(
      cart([{ itemType: "PRODUCT", itemId: "product-1", qty: 1 }]),
    );
    mockGetById.mockResolvedValue(listing({ price: 50000n })); // vendor raised the price after add-to-cart

    await placeOrder(BUYER_ID, MEMBER_ID, { idempotencyKey: "idem-2" });

    expect(mockCreateOrder).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ subtotal: 50000n }),
    );
  });

  it("rejects checkout outright if a listing is no longer approved/active, rather than silently using a stale price", async () => {
    mockGetOpenCartWithItems.mockResolvedValue(
      cart([{ itemType: "PRODUCT", itemId: "product-1", qty: 1 }]),
    );
    mockGetById.mockResolvedValue(listing({ isActive: false }));

    await expect(placeOrder(BUYER_ID, MEMBER_ID, { idempotencyKey: "idem-3" })).rejects.toThrow();
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });
});

describe("placeOrder — stock race", () => {
  it("treats a failed conditional stock decrement as insufficient stock and aborts the whole checkout", async () => {
    // decrementProductStock's atomicity (the actual race defense) is a
    // property of Postgres row-locking under `WHERE stock >= qty` — not
    // reproducible against a mock without a live DB. What IS verified here
    // is the half we control: when that conditional update reports it
    // couldn't claim the stock (count 0), checkout-service.ts must treat it
    // as a hard failure and create NOTHING, not proceed with a phantom order.
    mockGetOpenCartWithItems.mockResolvedValue(
      cart([{ itemType: "PRODUCT", itemId: "product-1", qty: 1 }]),
    );
    mockGetById.mockResolvedValue(listing({ stock: 1 }));
    mockDecrementProductStock.mockResolvedValue(false); // another request already claimed the last unit

    await expect(placeOrder(BUYER_ID, MEMBER_ID, { idempotencyKey: "idem-4" })).rejects.toThrow(
      /sold out/,
    );
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  it("rolls back an entire multi-vendor checkout if only ONE vendor's item is out of stock", async () => {
    mockGetOpenCartWithItems.mockResolvedValue(
      cart([
        { itemType: "PRODUCT", itemId: "product-a", qty: 1 },
        { itemType: "PRODUCT", itemId: "product-b", qty: 1 },
      ]),
    );
    mockGetById.mockImplementation(async (id: string) =>
      id === "product-a"
        ? listing({ id: "product-a", vendorId: VENDOR_A, stock: 5 })
        : listing({ id: "product-b", vendorId: VENDOR_B, stock: 5 }),
    );
    // Vendor A's item succeeds, vendor B's fails.
    mockDecrementProductStock.mockImplementation(async (_tx: unknown, productId: string) =>
      productId !== "product-b",
    );

    await expect(placeOrder(BUYER_ID, MEMBER_ID, { idempotencyKey: "idem-5" })).rejects.toThrow();

    // Transaction safety, as far as a mocked Prisma client can prove it:
    // vendor A's createOrder and vendor B's failed decrement both ran
    // inside the SAME prisma.$transaction() call (one atomic unit, not two
    // independent writes) — in a real Postgres transaction this is exactly
    // what makes vendor A's write roll back together with vendor B's
    // failure. Actual rollback behavior itself requires a live database to
    // observe and isn't reproducible against a mock.
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(mockCreateOrder).toHaveBeenCalledTimes(1); // vendor A's attempt, inside the doomed transaction
  });
});

describe("placeOrder — duplicate checkout / idempotency", () => {
  it("returns the already-placed order on a retried submission with the same idempotency key, creating nothing new", async () => {
    mockFindCheckoutByIdempotencyKey.mockResolvedValue({
      id: "existing-checkout",
      orders: [{ id: "existing-order-1" }],
    });

    const result = await placeOrder(BUYER_ID, MEMBER_ID, { idempotencyKey: "idem-dup" });

    expect(result).toEqual({ checkoutId: "existing-checkout", orderIds: ["existing-order-1"] });
    expect(mockGetOpenCartWithItems).not.toHaveBeenCalled();
    expect(mockCreateOrder).not.toHaveBeenCalled();
    expect(mockDecrementProductStock).not.toHaveBeenCalled();
  });

  it("a second call with the same key after a real first call doesn't double-create orders", async () => {
    mockGetOpenCartWithItems.mockResolvedValue(
      cart([{ itemType: "PRODUCT", itemId: "product-1", qty: 1 }]),
    );
    mockGetById.mockResolvedValue(listing());

    await placeOrder(BUYER_ID, MEMBER_ID, { idempotencyKey: "idem-6" });
    expect(mockCreateOrder).toHaveBeenCalledTimes(1);

    // Simulate the key now being found (as it would be, for real, after the
    // first call committed a Checkout row with it).
    mockFindCheckoutByIdempotencyKey.mockResolvedValue({
      id: "checkout-1",
      orders: [{ id: "order-1" }],
    });

    const second = await placeOrder(BUYER_ID, MEMBER_ID, { idempotencyKey: "idem-6" });
    expect(mockCreateOrder).toHaveBeenCalledTimes(1); // still just the one from before
    expect(second.orderIds).toEqual(["order-1"]);
  });
});

describe("placeOrder — invalid coupon", () => {
  it("rejects a coupon code that doesn't exist", async () => {
    mockGetOpenCartWithItems.mockResolvedValue(
      cart([{ itemType: "PRODUCT", itemId: "product-1", qty: 1 }]),
    );
    mockGetById.mockResolvedValue(listing());
    mockFindCouponByCode.mockResolvedValue(null);

    await expect(
      placeOrder(BUYER_ID, MEMBER_ID, { idempotencyKey: "idem-7", couponCode: "NOPE" }),
    ).rejects.toThrow(/doesn't exist/);
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  it("rejects an expired coupon", async () => {
    mockGetOpenCartWithItems.mockResolvedValue(
      cart([{ itemType: "PRODUCT", itemId: "product-1", qty: 1 }]),
    );
    mockGetById.mockResolvedValue(listing());
    mockFindCouponByCode.mockResolvedValue({
      id: "coupon-1",
      discountType: "PERCENT",
      valuePercentBps: 1000,
      valueFixed: null,
      minOrderAmount: 0n,
      startsAt: new Date("2020-01-01"),
      expiresAt: new Date("2020-02-01"),
      usageLimit: null,
      usageLimitPerMember: 1,
      deletedAt: null,
    });

    await expect(
      placeOrder(BUYER_ID, MEMBER_ID, { idempotencyKey: "idem-8", couponCode: "EXPIRED10" }),
    ).rejects.toThrow(/expired/);
    expect(mockCreateOrder).not.toHaveBeenCalled();
  });

  it("applies a valid coupon's discount to the order", async () => {
    mockGetOpenCartWithItems.mockResolvedValue(
      cart([{ itemType: "PRODUCT", itemId: "product-1", qty: 1 }]),
    );
    mockGetById.mockResolvedValue(listing({ price: 10000n }));
    mockFindCouponByCode.mockResolvedValue({
      id: "coupon-1",
      discountType: "PERCENT",
      valuePercentBps: 1000, // 10%
      valueFixed: null,
      minOrderAmount: 0n,
      startsAt: new Date("2020-01-01"),
      expiresAt: null,
      usageLimit: null,
      usageLimitPerMember: 1,
      deletedAt: null,
    });

    await placeOrder(BUYER_ID, MEMBER_ID, { idempotencyKey: "idem-9", couponCode: "SAVE10" });

    expect(mockCreateOrder).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ subtotal: 10000n, discountTotal: 1000n, grandTotal: 9000n }),
    );
    expect(mockCreateCouponRedemption).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ couponId: "coupon-1", amountDiscounted: 1000n }),
    );
  });
});

describe("placeOrder — multi-vendor cart", () => {
  it("splits a multi-vendor cart into one order per vendor", async () => {
    mockGetOpenCartWithItems.mockResolvedValue(
      cart([
        { itemType: "PRODUCT", itemId: "product-a", qty: 1 },
        { itemType: "PRODUCT", itemId: "product-b", qty: 1 },
      ]),
    );
    mockGetById.mockImplementation(async (id: string) =>
      id === "product-a"
        ? listing({ id: "product-a", vendorId: VENDOR_A, price: 10000n })
        : listing({ id: "product-b", vendorId: VENDOR_B, price: 30000n }),
    );

    const result = await placeOrder(BUYER_ID, MEMBER_ID, { idempotencyKey: "idem-10" });

    expect(mockCreateOrder).toHaveBeenCalledTimes(2);
    expect(mockCreateOrder).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ vendorId: VENDOR_A, subtotal: 10000n }),
    );
    expect(mockCreateOrder).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ vendorId: VENDOR_B, subtotal: 30000n }),
    );
    expect(result.orderIds).toHaveLength(2);
  });

  it("apportions a single cross-cart coupon discount across both vendor orders, summing exactly to the total discount", async () => {
    mockGetOpenCartWithItems.mockResolvedValue(
      cart([
        { itemType: "PRODUCT", itemId: "product-a", qty: 1 },
        { itemType: "PRODUCT", itemId: "product-b", qty: 1 },
      ]),
    );
    mockGetById.mockImplementation(async (id: string) =>
      id === "product-a"
        ? listing({ id: "product-a", vendorId: VENDOR_A, price: 3000n })
        : listing({ id: "product-b", vendorId: VENDOR_B, price: 7000n }),
    );
    mockFindCouponByCode.mockResolvedValue({
      id: "coupon-1",
      discountType: "FIXED",
      valuePercentBps: null,
      valueFixed: 1000n,
      minOrderAmount: 0n,
      startsAt: new Date("2020-01-01"),
      expiresAt: null,
      usageLimit: null,
      usageLimitPerMember: 1,
      deletedAt: null,
    });

    await placeOrder(BUYER_ID, MEMBER_ID, { idempotencyKey: "idem-11", couponCode: "FLAT10" });

    const calls = mockCreateOrder.mock.calls.map((call) => call[1] as { discountTotal: bigint });
    const totalDiscount = calls.reduce((sum, c) => sum + c.discountTotal, 0n);
    expect(totalDiscount).toBe(1000n); // the full coupon value, split across the 2 orders, no leftover paise
  });

  it("decrements stock independently per vendor's product", async () => {
    mockGetOpenCartWithItems.mockResolvedValue(
      cart([
        { itemType: "PRODUCT", itemId: "product-a", qty: 2 },
        { itemType: "PRODUCT", itemId: "product-b", qty: 3 },
      ]),
    );
    mockGetById.mockImplementation(async (id: string) =>
      id === "product-a"
        ? listing({ id: "product-a", vendorId: VENDOR_A, stock: 10 })
        : listing({ id: "product-b", vendorId: VENDOR_B, stock: 10 }),
    );

    await placeOrder(BUYER_ID, MEMBER_ID, { idempotencyKey: "idem-12" });

    expect(mockDecrementProductStock).toHaveBeenCalledWith(expect.anything(), "product-a", 2);
    expect(mockDecrementProductStock).toHaveBeenCalledWith(expect.anything(), "product-b", 3);
  });
});
