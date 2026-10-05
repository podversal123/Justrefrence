import { describe, expect, it, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";

/**
 * Integration-style tests for the Razorpay payment flow — mocked at the
 * module boundary (repositories/clients that carry "server-only"), same
 * convention as tests/integration/checkout-service.test.ts. The
 * orchestration (payment-service.ts) AND payment-repository.ts's atomic
 * capture/failure logic are REAL, exercised against a stateful mock
 * Prisma client — this is what the Phase 8 brief's required scenarios
 * (duplicate webhook, invalid signature, payment failure, payment
 * timeout, retry, duplicate payment) actually test.
 */

const mockRecordAudit = vi.fn();
vi.mock("@/server/domain/audit/record", () => ({ recordAudit: mockRecordAudit }));

const mockTransitionOrderStatusBySystem = vi.fn().mockResolvedValue(undefined);
vi.mock("@/server/domain/commerce/order-service", () => ({
  transitionOrderStatusBySystem: mockTransitionOrderStatusBySystem,
}));

const mockCreateRazorpayOrder = vi.fn();
const mockCreateRazorpayRefund = vi.fn();
const mockGetRazorpayKeySecret = vi.fn();
const mockGetRazorpayWebhookSecret = vi.fn();
vi.mock("@/server/lib/razorpay-client", () => ({
  createRazorpayOrder: mockCreateRazorpayOrder,
  createRazorpayRefund: mockCreateRazorpayRefund,
  getRazorpayKeySecret: mockGetRazorpayKeySecret,
  getRazorpayWebhookSecret: mockGetRazorpayWebhookSecret,
}));

const mockCreatePaymentEvent = vi.fn();
const mockFindEventByProviderEventId = vi.fn().mockResolvedValue(null);
vi.mock("@/server/repositories/payment/payment-event-repository", () => ({
  createPaymentEvent: mockCreatePaymentEvent,
  findEventByProviderEventId: mockFindEventByProviderEventId,
}));

const mockCreatePaymentTransaction = vi.fn();
vi.mock("@/server/repositories/payment/payment-transaction-repository", () => ({
  createPaymentTransaction: mockCreatePaymentTransaction,
}));

// --- Stateful Prisma mock: a real in-memory `payments` + `orders` table ---

interface MockPayment {
  id: string;
  checkoutId: string | null;
  payerId: string;
  purpose: string;
  providerOrderId: string;
  providerPaymentId: string | null;
  amount: bigint;
  currency: string;
  status: string;
  idempotencyKey: string;
  createdAt: Date;
}

let payments: MockPayment[] = [];
let orders: { id: string; checkoutId: string; grandTotal: bigint; currency: string; status: string }[] = [];
let paymentIdCounter = 0;

function resetState() {
  payments = [];
  orders = [];
  paymentIdCounter = 0;
}

const prismaMock = {
  payment: {
    create: vi.fn(async ({ data }: { data: Omit<MockPayment, "id" | "createdAt" | "providerPaymentId" | "status"> }) => {
      const created: MockPayment = {
        id: `payment-${++paymentIdCounter}`,
        createdAt: new Date(),
        providerPaymentId: null,
        status: "CREATED",
        ...data,
      };
      payments.push(created);
      return created;
    }),
    findUnique: vi.fn(async ({ where }: { where: { id?: string; idempotencyKey?: string } }) => {
      if (where.id) return payments.find((p) => p.id === where.id) ?? null;
      if (where.idempotencyKey) return payments.find((p) => p.idempotencyKey === where.idempotencyKey) ?? null;
      return null;
    }),
    findFirst: vi.fn(async ({ where }: { where: { providerOrderId?: string } }) => {
      return payments.find((p) => p.providerOrderId === where.providerOrderId) ?? null;
    }),
    findMany: vi.fn(async ({ where }: { where: { status?: string; createdAt?: { lte: Date } } }) => {
      return payments.filter((p) => {
        if (where.status && p.status !== where.status) return false;
        if (where.createdAt?.lte && p.createdAt.getTime() > where.createdAt.lte.getTime()) return false;
        return true;
      });
    }),
    updateMany: vi.fn(
      async ({
        where,
        data,
      }: {
        where: { id: string; status: string | { in: string[] } };
        data: Record<string, unknown>;
      }) => {
        const matches = payments.filter((p) => {
          if (p.id !== where.id) return false;
          if (typeof where.status === "string") return p.status === where.status;
          return where.status.in.includes(p.status);
        });
        for (const p of matches) Object.assign(p, data);
        return { count: matches.length };
      },
    ),
  },
  checkout: {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) =>
      where.id === CHECKOUT_ID ? { buyerId: PAYER_ID } : null,
    ),
  },
  order: {
    findMany: vi.fn(async ({ where }: { where: { checkoutId?: string } }) => {
      return orders.filter((o) => !where.checkoutId || o.checkoutId === where.checkoutId);
    }),
  },
  $transaction: vi.fn(async (arg: unknown) => {
    if (typeof arg === "function") return (arg as (tx: unknown) => unknown)(prismaMock);
    return Promise.all(arg as Promise<unknown>[]);
  }),
};
vi.mock("@/server/lib/prisma", () => ({ prisma: prismaMock }));

const {
  createPaymentOrderForCheckout,
  verifyCheckoutCallback,
  processWebhookEvent,
  markPaymentFailed,
  expireStalePayments,
} = await import("@/server/domain/payment/payment-service");

const PAYER_ID = "11111111-1111-4111-8111-111111111111";
const CHECKOUT_ID = "22222222-2222-4222-8222-222222222222";
const KEY_SECRET = "test_key_secret";
const WEBHOOK_SECRET = "test_webhook_secret";

function seedOrder(overrides: Partial<(typeof orders)[number]> = {}) {
  orders.push({ id: `order-${orders.length + 1}`, checkoutId: CHECKOUT_ID, grandTotal: 10000n, currency: "INR", status: "PLACED", ...overrides });
}

beforeEach(() => {
  vi.clearAllMocks();
  resetState();
  mockFindEventByProviderEventId.mockResolvedValue(null);
  mockGetRazorpayKeySecret.mockReturnValue(KEY_SECRET);
  mockGetRazorpayWebhookSecret.mockReturnValue(WEBHOOK_SECRET);
  mockCreateRazorpayOrder.mockImplementation(async ({ receipt }: { receipt: string }) => ({
    id: `order_rzp_${receipt}`,
    amount: 10000,
    currency: "INR",
    status: "created",
  }));
});

describe("createPaymentOrderForCheckout — duplicate payment / retry", () => {
  it("creates a Razorpay order and a Payment row for a fresh checkout", async () => {
    seedOrder();

    const result = await createPaymentOrderForCheckout(CHECKOUT_ID, PAYER_ID, "idem-1");

    expect(result.providerOrderId).toBe(`order_rzp_${CHECKOUT_ID}`);
    expect(result.amount).toBe(10000n);
    expect(payments).toHaveLength(1);
  });

  it("is idempotent on idempotencyKey — a duplicate submission returns the SAME payment, no second Razorpay order", async () => {
    seedOrder();

    const first = await createPaymentOrderForCheckout(CHECKOUT_ID, PAYER_ID, "idem-1");
    const second = await createPaymentOrderForCheckout(CHECKOUT_ID, PAYER_ID, "idem-1");

    expect(second.paymentId).toBe(first.paymentId);
    expect(mockCreateRazorpayOrder).toHaveBeenCalledTimes(1);
    expect(payments).toHaveLength(1);
  });

  it("refuses to create a new payment order once the checkout already has a CAPTURED payment (duplicate payment)", async () => {
    seedOrder();
    payments.push({
      id: "payment-existing",
      checkoutId: CHECKOUT_ID,
      payerId: PAYER_ID,
      purpose: "ORDER",
      providerOrderId: "order_rzp_already_paid",
      providerPaymentId: "pay_already_paid",
      amount: 10000n,
      currency: "INR",
      status: "CAPTURED",
      idempotencyKey: "idem-original",
      createdAt: new Date(),
    });

    await expect(createPaymentOrderForCheckout(CHECKOUT_ID, PAYER_ID, "idem-new")).rejects.toThrow(
      /already been paid/,
    );
    expect(mockCreateRazorpayOrder).not.toHaveBeenCalled();
  });

  it("retry: allows a NEW payment order for the same checkout after a prior attempt FAILED", async () => {
    seedOrder();
    payments.push({
      id: "payment-failed-1",
      checkoutId: CHECKOUT_ID,
      payerId: PAYER_ID,
      purpose: "ORDER",
      providerOrderId: "order_rzp_first_try",
      providerPaymentId: null,
      amount: 10000n,
      currency: "INR",
      status: "FAILED",
      idempotencyKey: "idem-first-try",
      createdAt: new Date(),
    });

    const retry = await createPaymentOrderForCheckout(CHECKOUT_ID, PAYER_ID, "idem-retry");

    expect(retry.paymentId).not.toBe("payment-failed-1");
    expect(payments).toHaveLength(2);
    expect(payments.find((p) => p.id === "payment-failed-1")!.status).toBe("FAILED"); // untouched
  });

  it("refuses to create a payment order for a checkout the caller does not own", async () => {
    seedOrder();

    await expect(
      createPaymentOrderForCheckout(CHECKOUT_ID, "99999999-9999-4999-8999-999999999999", "idem-1"),
    ).rejects.toThrow(/not found/i);
    expect(mockCreateRazorpayOrder).not.toHaveBeenCalled();
  });

  it("namespaces the client key per user — another user's same key is never replayed", async () => {
    seedOrder();
    await createPaymentOrderForCheckout(CHECKOUT_ID, PAYER_ID, "idem-1");

    expect(payments[0]!.idempotencyKey).toBe(`payment-order:${PAYER_ID}:idem-1`);
  });

  it("a fresh idempotency key reuses the checkout's open (unpaid) payment instead of minting another Razorpay order", async () => {
    seedOrder();

    const first = await createPaymentOrderForCheckout(CHECKOUT_ID, PAYER_ID, "idem-1");
    const second = await createPaymentOrderForCheckout(CHECKOUT_ID, PAYER_ID, "idem-fresh-key");

    expect(second.paymentId).toBe(first.paymentId);
    expect(mockCreateRazorpayOrder).toHaveBeenCalledTimes(1);
    expect(payments).toHaveLength(1);
  });
});

describe("verifyCheckoutCallback — invalid signature", () => {
  it("captures the payment and marks orders PAID on a valid signature", async () => {
    seedOrder();
    const order = await createPaymentOrderForCheckout(CHECKOUT_ID, PAYER_ID, "idem-1");
    const providerPaymentId = "pay_123";
    const signature = createHmac("sha256", KEY_SECRET).update(`${order.providerOrderId}|${providerPaymentId}`).digest("hex");

    const result = await verifyCheckoutCallback({
      providerOrderId: order.providerOrderId,
      providerPaymentId,
      signature,
    });

    expect(result.captured).toBe(true);
    expect(payments[0]!.status).toBe("CAPTURED");
    expect(mockTransitionOrderStatusBySystem).toHaveBeenCalledWith(orders[0]!.id, "PAID", "Payment captured");
  });

  it("rejects an invalid signature and captures nothing", async () => {
    seedOrder();
    const order = await createPaymentOrderForCheckout(CHECKOUT_ID, PAYER_ID, "idem-1");

    await expect(
      verifyCheckoutCallback({
        providerOrderId: order.providerOrderId,
        providerPaymentId: "pay_123",
        signature: "not-a-real-signature",
      }),
    ).rejects.toThrow(/verification failed/);

    expect(payments[0]!.status).toBe("CREATED");
    expect(mockTransitionOrderStatusBySystem).not.toHaveBeenCalled();
  });

  it("rejects a signature computed for a different payment id (tampered callback)", async () => {
    seedOrder();
    const order = await createPaymentOrderForCheckout(CHECKOUT_ID, PAYER_ID, "idem-1");
    const signature = createHmac("sha256", KEY_SECRET).update(`${order.providerOrderId}|pay_real`).digest("hex");

    await expect(
      verifyCheckoutCallback({
        providerOrderId: order.providerOrderId,
        providerPaymentId: "pay_attacker_substituted",
        signature,
      }),
    ).rejects.toThrow(/verification failed/);

    expect(payments[0]!.status).toBe("CREATED");
  });
});

describe("processWebhookEvent — duplicate webhook / invalid signature / payment failure", () => {
  function webhookBody(event: string, orderId: string, paymentId: string) {
    return JSON.stringify({
      event,
      payload: { payment: { entity: { id: paymentId, order_id: orderId } } },
    });
  }

  it("captures the payment and marks orders PAID on payment.captured with a valid signature", async () => {
    seedOrder();
    const order = await createPaymentOrderForCheckout(CHECKOUT_ID, PAYER_ID, "idem-1");
    const body = webhookBody("payment.captured", order.providerOrderId, "pay_webhook_1");
    const signature = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");

    const result = await processWebhookEvent(body, signature);

    expect(result.accepted).toBe(true);
    expect(payments[0]!.status).toBe("CAPTURED");
    expect(mockTransitionOrderStatusBySystem).toHaveBeenCalledWith(orders[0]!.id, "PAID", "Payment captured");
  });

  it("rejects an invalid webhook signature and captures nothing", async () => {
    seedOrder();
    const order = await createPaymentOrderForCheckout(CHECKOUT_ID, PAYER_ID, "idem-1");
    const body = webhookBody("payment.captured", order.providerOrderId, "pay_webhook_2");

    const result = await processWebhookEvent(body, "invalid-signature");

    expect(result.accepted).toBe(false);
    expect(payments[0]!.status).toBe("CREATED");
    expect(mockCreatePaymentEvent).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ signatureValid: false }),
    );
  });

  it("is idempotent against a REDELIVERED (duplicate) webhook for the same event id", async () => {
    seedOrder();
    const order = await createPaymentOrderForCheckout(CHECKOUT_ID, PAYER_ID, "idem-1");
    const body = webhookBody("payment.captured", order.providerOrderId, "pay_webhook_3");
    const signature = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");

    const first = await processWebhookEvent(body, signature);
    // Simulate the dedup lookup now finding the event that was just recorded.
    mockFindEventByProviderEventId.mockResolvedValue({ id: "event-1" });
    const second = await processWebhookEvent(body, signature);

    expect(first.accepted).toBe(true);
    expect(second).toEqual({ accepted: true, reason: "duplicate" });
    expect(mockTransitionOrderStatusBySystem).toHaveBeenCalledTimes(1); // not re-applied
  });

  it("marks the payment FAILED on payment.failed with a valid signature", async () => {
    seedOrder();
    const order = await createPaymentOrderForCheckout(CHECKOUT_ID, PAYER_ID, "idem-1");
    const body = webhookBody("payment.failed", order.providerOrderId, "pay_webhook_4");
    const signature = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");

    const result = await processWebhookEvent(body, signature);

    expect(result.accepted).toBe(true);
    expect(payments[0]!.status).toBe("FAILED");
    expect(mockTransitionOrderStatusBySystem).not.toHaveBeenCalled();
  });

  it("rejects a webhook for an order id this system never created a payment for", async () => {
    const body = webhookBody("payment.captured", "order_rzp_unknown", "pay_webhook_5");
    const signature = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");

    const result = await processWebhookEvent(body, signature);

    expect(result.accepted).toBe(false);
    expect(result.reason).toMatch(/Unknown payment order/);
  });

  it("does not double-capture when the webhook arrives AFTER the checkout.js callback already captured it", async () => {
    seedOrder();
    const order = await createPaymentOrderForCheckout(CHECKOUT_ID, PAYER_ID, "idem-1");
    const providerPaymentId = "pay_race_1";
    const callbackSig = createHmac("sha256", KEY_SECRET).update(`${order.providerOrderId}|${providerPaymentId}`).digest("hex");
    await verifyCheckoutCallback({ providerOrderId: order.providerOrderId, providerPaymentId, signature: callbackSig });

    const body = webhookBody("payment.captured", order.providerOrderId, providerPaymentId);
    const webhookSig = createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
    await processWebhookEvent(body, webhookSig);

    expect(mockCreatePaymentTransaction).toHaveBeenCalledTimes(1); // only the FIRST (callback) capture recorded a transaction
    expect(mockTransitionOrderStatusBySystem).toHaveBeenCalledTimes(1);
  });
});

describe("payment failure and timeout", () => {
  it("markPaymentFailed transitions a CREATED payment to FAILED", async () => {
    seedOrder();
    const order = await createPaymentOrderForCheckout(CHECKOUT_ID, PAYER_ID, "idem-1");

    const applied = await markPaymentFailed(order.paymentId, "User abandoned checkout");

    expect(applied).toBe(true);
    expect(payments[0]!.status).toBe("FAILED");
  });

  it("markPaymentFailed is a no-op against an already-CAPTURED payment", async () => {
    seedOrder();
    const order = await createPaymentOrderForCheckout(CHECKOUT_ID, PAYER_ID, "idem-1");
    const signature = createHmac("sha256", KEY_SECRET).update(`${order.providerOrderId}|pay_1`).digest("hex");
    await verifyCheckoutCallback({ providerOrderId: order.providerOrderId, providerPaymentId: "pay_1", signature });

    const applied = await markPaymentFailed(order.paymentId, "Late failure report");

    expect(applied).toBe(false);
    expect(payments[0]!.status).toBe("CAPTURED"); // never downgraded
  });

  it("expireStalePayments fails CREATED payments older than the timeout window", async () => {
    seedOrder();
    const order = await createPaymentOrderForCheckout(CHECKOUT_ID, PAYER_ID, "idem-1");
    payments[0]!.createdAt = new Date(Date.now() - 60 * 60 * 1000); // 1 hour ago

    const count = await expireStalePayments(30, new Date());

    expect(count).toBe(1);
    expect(payments[0]!.status).toBe("FAILED");
    expect(order.paymentId).toBe(payments[0]!.id);
  });

  it("expireStalePayments leaves a fresh (within-window) CREATED payment untouched", async () => {
    seedOrder();
    await createPaymentOrderForCheckout(CHECKOUT_ID, PAYER_ID, "idem-1"); // created "now"

    const count = await expireStalePayments(30, new Date());

    expect(count).toBe(0);
    expect(payments[0]!.status).toBe("CREATED");
  });
});
