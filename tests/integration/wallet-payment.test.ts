import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Paying a checkout from the wallet, its refund back to the wallet, and the offer shown on the payment screen.
 * The payment orchestration is real; the database client, the repositories and the ledger are replaced by
 * fakes (no database here), so each case states exactly what must and must not be written.
 */

vi.mock("server-only", () => ({}));

const mockRecordAudit = vi.fn();
vi.mock("@/server/domain/audit/record", () => ({ recordAudit: mockRecordAudit }));

const mockTransition = vi.fn().mockResolvedValue(undefined);
vi.mock("@/server/domain/commerce/order-service", () => ({
  transitionOrderStatusBySystem: mockTransition,
}));

const mockCreateRazorpayRefund = vi.fn();
vi.mock("@/server/lib/razorpay-client", () => ({
  createRazorpayOrder: vi.fn(),
  createRazorpayRefund: mockCreateRazorpayRefund,
  getRazorpayKeySecret: vi.fn(),
  getRazorpayWebhookSecret: vi.fn(),
}));

vi.mock("@/server/repositories/payment/payment-event-repository", () => ({
  createPaymentEvent: vi.fn(),
  findEventByProviderEventId: vi.fn(),
}));
const mockCreatePaymentTransaction = vi.fn();
vi.mock("@/server/repositories/payment/payment-transaction-repository", () => ({
  createPaymentTransaction: mockCreatePaymentTransaction,
}));

const mockCreatePayment = vi.fn();
const mockGetByKey = vi.fn();
const mockListForCheckout = vi.fn();
const mockTryCapture = vi.fn();
const mockTryRefunded = vi.fn();
vi.mock("@/server/repositories/payment/payment-repository", () => ({
  createPayment: mockCreatePayment,
  getPaymentByIdempotencyKey: mockGetByKey,
  getPaymentByProviderOrderId: vi.fn(),
  listPaymentsForCheckout: mockListForCheckout,
  tryCapturePayment: mockTryCapture,
  tryMarkPaymentFailed: vi.fn(),
  tryMarkPaymentRefunded: mockTryRefunded,
}));

const mockDebit = vi.fn();
const mockCredit = vi.fn();
vi.mock("@/server/repositories/wallet/wallet-repository", () => ({
  getOrCreateWallet: vi.fn(async () => ({ id: "wallet-1" })),
  debitWallet: mockDebit,
  creditWallet: mockCredit,
}));

const BUYER = "11111111-1111-4111-8111-111111111111";
const CHECKOUT = "22222222-2222-4222-8222-222222222222";

const mockCheckout = vi.fn();
const mockCheckoutFirst = vi.fn();
const mockOrders = vi.fn();
const mockPaymentFirst = vi.fn();
const mockPaymentById = vi.fn();
const mockWallet = vi.fn();
const prismaMock = {
  checkout: { findUnique: mockCheckout, findFirst: mockCheckoutFirst },
  order: { findMany: mockOrders },
  payment: { findFirst: mockPaymentFirst, findUnique: mockPaymentById },
  wallet: { findUnique: mockWallet },
  $transaction: vi.fn(async (run: (tx: unknown) => unknown) => run({})),
};
vi.mock("@/server/lib/prisma", () => ({ prisma: prismaMock }));

const { payCheckoutWithWallet, initiateRefund, getWalletPayOffer } = await import(
  "@/server/domain/payment/payment-service"
);

const key = "33333333-3333-4333-8333-333333333333";
const pay = (over: Partial<{ payerId: string; idempotencyKey: string }> = {}) =>
  payCheckoutWithWallet({ checkoutId: CHECKOUT, payerId: BUYER, idempotencyKey: key, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  mockCheckout.mockResolvedValue({ buyerId: BUYER });
  mockGetByKey.mockResolvedValue(null);
  mockListForCheckout.mockResolvedValue([]);
  // Two vendor orders under one checkout: the wallet pays their sum.
  mockOrders.mockImplementation(async ({ select }: { select: Record<string, boolean> }) =>
    select["status"]
      ? [
          { id: "o1", status: "PLACED" },
          { id: "o2", status: "PLACED" },
        ]
      : [
          { grandTotal: 60_000n, currency: "INR" },
          { grandTotal: 40_000n, currency: "INR" },
        ],
  );
  mockCreatePayment.mockResolvedValue({ id: "pay-1" });
  mockDebit.mockResolvedValue({ applied: true, transaction: { id: "tx-1", balanceAfter: 0n } });
  mockTryCapture.mockResolvedValue(true);
  mockTryRefunded.mockResolvedValue(true);
});

describe("payCheckoutWithWallet", () => {
  it("debits the whole total, captures the payment and marks every order paid", async () => {
    const result = await pay();

    expect(result).toEqual({ paymentId: "pay-1", amount: 100_000n, replay: false });
    expect(mockCreatePayment).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: "WALLET",
        purpose: "ORDER",
        amount: 100_000n,
        checkoutId: CHECKOUT,
        payerId: BUYER,
      }),
      expect.anything(),
    );
    expect(mockDebit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        walletId: "wallet-1",
        amount: 100_000n,
        type: "ORDER_PAYMENT",
        referenceId: "pay-1",
      }),
    );
    expect(mockCreatePaymentTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ type: "CAPTURE", amount: 100_000n }),
    );
    expect(mockTransition).toHaveBeenCalledTimes(2);
    expect(mockTransition).toHaveBeenCalledWith("o1", "PAID", "Payment captured");
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "PAYMENT_CAPTURED", actorId: BUYER }),
    );
  });

  it("refuses when the balance is not enough, and writes nothing that counts", async () => {
    mockDebit.mockResolvedValue({ applied: false });

    await expect(pay()).rejects.toThrow(/not enough/i);

    expect(mockTryCapture).not.toHaveBeenCalled();
    expect(mockCreatePaymentTransaction).not.toHaveBeenCalled();
    expect(mockTransition).not.toHaveBeenCalled();
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });

  it("answers 'not found' for a checkout that belongs to someone else", async () => {
    mockCheckout.mockResolvedValue({ buyerId: "someone-else" });

    await expect(pay()).rejects.toThrow(/not found/i);

    expect(mockDebit).not.toHaveBeenCalled();
    expect(mockCreatePayment).not.toHaveBeenCalled();
  });

  it("answers 'not found' for a checkout that does not exist", async () => {
    mockCheckout.mockResolvedValue(null);
    await expect(pay()).rejects.toThrow(/not found/i);
  });

  it("returns the same payment for a repeated request id and charges nothing more", async () => {
    mockGetByKey.mockResolvedValue({ id: "pay-1", checkoutId: CHECKOUT, amount: 100_000n });

    const result = await pay();

    expect(result).toEqual({ paymentId: "pay-1", amount: 100_000n, replay: true });
    expect(mockDebit).not.toHaveBeenCalled();
    expect(mockCreatePayment).not.toHaveBeenCalled();
  });

  it("refuses a request id that was already used for a different checkout", async () => {
    mockGetByKey.mockResolvedValue({ id: "pay-9", checkoutId: "other", amount: 1n });
    await expect(pay()).rejects.toThrow(/different checkout/i);
    expect(mockDebit).not.toHaveBeenCalled();
  });

  it("refuses a checkout that is already paid, even with a fresh request id", async () => {
    mockListForCheckout.mockResolvedValue([{ status: "CAPTURED" }]);
    await expect(pay()).rejects.toThrow(/already been paid/i);
    expect(mockDebit).not.toHaveBeenCalled();
  });

  it("refuses when there is nothing to pay", async () => {
    mockOrders.mockImplementation(async () => [{ grandTotal: 0n, currency: "INR" }]);
    await expect(pay()).rejects.toThrow(/nothing to pay/i);
    expect(mockDebit).not.toHaveBeenCalled();
  });

  it("answers a simultaneous identical request with the winner's payment", async () => {
    mockCreatePayment.mockRejectedValue(Object.assign(new Error("dup"), { code: "P2002" }));
    mockGetByKey
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "pay-winner", checkoutId: CHECKOUT, amount: 100_000n });

    const result = await pay();

    expect(result).toEqual({ paymentId: "pay-winner", amount: 100_000n, replay: true });
    expect(mockTransition).not.toHaveBeenCalled();
  });
});

describe("initiateRefund for a wallet payment", () => {
  const walletPayment = {
    id: "pay-1",
    provider: "WALLET",
    status: "CAPTURED",
    providerPaymentId: "wallet_pay-1",
    amount: 100_000n,
    payerId: BUYER,
    checkoutId: CHECKOUT,
  };

  it("credits the wallet back and never calls the gateway", async () => {
    mockPaymentById.mockResolvedValue(walletPayment);
    mockOrders.mockResolvedValue([{ id: "o1" }]);

    await initiateRefund("pay-1", "staff-1");

    expect(mockCreateRazorpayRefund).not.toHaveBeenCalled();
    expect(mockCredit).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        walletId: "wallet-1",
        amount: 100_000n,
        type: "REFUND",
        idempotencyKey: "wallet-refund:pay-1",
      }),
    );
    expect(mockTransition).toHaveBeenCalledWith("o1", "REFUNDED", "Payment refunded");
  });

  it("does not credit the wallet when the payment is no longer refundable", async () => {
    mockPaymentById.mockResolvedValue(walletPayment);
    mockTryRefunded.mockResolvedValue(false);

    await expect(initiateRefund("pay-1", "staff-1")).rejects.toThrow(/no longer refundable/i);

    expect(mockCredit).not.toHaveBeenCalled();
  });

  it("still sends an online payment's refund to the gateway, not the wallet", async () => {
    mockPaymentById.mockResolvedValue({ ...walletPayment, provider: "RAZORPAY" });
    mockCreateRazorpayRefund.mockResolvedValue({ id: "rfnd_1" });
    mockOrders.mockResolvedValue([]);

    await initiateRefund("pay-1", "staff-1");

    expect(mockCreateRazorpayRefund).toHaveBeenCalledTimes(1);
    expect(mockCredit).not.toHaveBeenCalled();
  });
});

describe("getWalletPayOffer", () => {
  beforeEach(() => {
    mockCheckoutFirst.mockResolvedValue({ id: CHECKOUT });
    mockPaymentFirst.mockResolvedValue(null);
    mockWallet.mockResolvedValue({ balance: 150_000n });
  });

  it("offers the wallet when it covers the whole amount", async () => {
    expect(await getWalletPayOffer(CHECKOUT, BUYER)).toEqual({
      amount: "100000",
      balance: "150000",
    });
  });

  it("offers it when the balance equals the amount exactly", async () => {
    mockWallet.mockResolvedValue({ balance: 100_000n });
    expect(await getWalletPayOffer(CHECKOUT, BUYER)).not.toBeNull();
  });

  it("offers nothing when the balance is one paisa short", async () => {
    mockWallet.mockResolvedValue({ balance: 99_999n });
    expect(await getWalletPayOffer(CHECKOUT, BUYER)).toBeNull();
  });

  it("offers nothing when the member has no wallet yet", async () => {
    mockWallet.mockResolvedValue(null);
    expect(await getWalletPayOffer(CHECKOUT, BUYER)).toBeNull();
  });

  it("offers nothing for someone else's checkout", async () => {
    mockCheckoutFirst.mockResolvedValue(null);
    expect(await getWalletPayOffer(CHECKOUT, BUYER)).toBeNull();
  });

  it("offers nothing once the checkout is paid", async () => {
    mockPaymentFirst.mockResolvedValue({ id: "pay-1" });
    expect(await getWalletPayOffer(CHECKOUT, BUYER)).toBeNull();
  });

  it("offers nothing for an id that is not a checkout id, without touching the database", async () => {
    expect(await getWalletPayOffer("not-an-id", BUYER)).toBeNull();
    expect(mockCheckoutFirst).not.toHaveBeenCalled();
  });
});
