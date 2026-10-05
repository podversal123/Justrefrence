import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Comprehensive integration-style tests for the commission engine — mocked
 * at the repository module boundary (all "server-only"), same convention as
 * tests/integration/checkout-service.test.ts. The orchestration itself
 * (commission-service.ts: multi-level resolution, deterministic
 * calculation, eligibility-at-creation, lifecycle transitions, reversal) is
 * REAL.
 */

const mockRecordAudit = vi.fn();
vi.mock("@/server/domain/audit/record", () => ({ recordAudit: mockRecordAudit }));

const mockFindActiveRules = vi.fn();
vi.mock("@/server/repositories/commission/commission-rule-repository", () => ({
  findActiveRules: mockFindActiveRules,
}));

const mockCreateCommission = vi.fn();
const mockCreateCommissionStatusHistory = vi.fn();
const mockFindExistingCommission = vi.fn().mockResolvedValue(null);
const mockListCommissionsForOrder = vi.fn();
const mockUpdateCommissionStatus = vi.fn();
const mockFindCommissionsPastReleaseAt = vi.fn();
let commissionIdCounter = 0;
vi.mock("@/server/repositories/commission/commission-repository", () => ({
  createCommission: (tx: unknown, data: Record<string, unknown>) => {
    commissionIdCounter += 1;
    const created = { id: `commission-${commissionIdCounter}`, status: "PENDING", ...data };
    mockCreateCommission(tx, data);
    return Promise.resolve(created);
  },
  createCommissionStatusHistory: mockCreateCommissionStatusHistory,
  findExistingCommission: mockFindExistingCommission,
  listCommissionsForOrder: mockListCommissionsForOrder,
  updateCommissionStatus: mockUpdateCommissionStatus,
  findCommissionsPastReleaseAt: mockFindCommissionsPastReleaseAt,
}));

const mockGetAncestorChain = vi.fn();
const mockCountCompletedOrders = vi.fn().mockResolvedValue(0);
vi.mock("@/server/repositories/referral/referral-repository", () => ({
  getAncestorChain: mockGetAncestorChain,
  countCompletedOrders: mockCountCompletedOrders,
}));

const mockGetOrCreateWalletTx = vi.fn().mockResolvedValue({ id: "wallet-1" });
const mockCreditWallet = vi.fn().mockResolvedValue({ applied: true });
const mockDebitWalletUpTo = vi.fn().mockResolvedValue({ debited: 0n });
vi.mock("@/server/repositories/wallet/wallet-repository", () => ({
  getOrCreateWalletTx: mockGetOrCreateWalletTx,
  creditWallet: mockCreditWallet,
  debitWalletUpTo: mockDebitWalletUpTo,
}));

const prismaMock = {
  memberProfile: { findUnique: vi.fn() },
  commissionRule: { findUnique: vi.fn() },
  $transaction: vi.fn(async (arg: unknown) => {
    if (typeof arg === "function") return (arg as (tx: unknown) => unknown)(prismaMock);
    return Promise.all(arg as Promise<unknown>[]);
  }),
};
vi.mock("@/server/lib/prisma", () => ({ prisma: prismaMock }));

const {
  createPendingCommissionsForOrder,
  promoteCommissionsForCompletedOrder,
  reverseOrCancelCommissionsForOrder,
  releaseEligibleCommissions,
} = await import("@/server/domain/commission/commission-service");

const ORDER_ID = "order-1";
const BUYER_ID = "11111111-1111-4111-8111-111111111111";
const BUYER_MEMBER_ID = "22222222-2222-4222-8222-222222222222";
const REFERRER_L1 = "33333333-3333-4333-8333-333333333333";
const REFERRER_L2 = "44444444-4444-4444-8444-444444444444";

function rule(overrides: Record<string, unknown> = {}) {
  return {
    id: "rule-1",
    level: 1,
    appliesTo: "PRODUCT",
    rateBasis: "PERCENT_OF_ORDER",
    rateValueBps: 500, // 5%
    rateValueFixed: null,
    qualifyingEvent: "ORDER_COMPLETED",
    requiresActiveSubscription: false,
    minimumActivityCount: null,
    releaseDelayDays: 7,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  commissionIdCounter = 0;
  mockFindExistingCommission.mockResolvedValue(null);
  mockCountCompletedOrders.mockResolvedValue(0);
  prismaMock.memberProfile.findUnique.mockResolvedValue({ userId: "referrer-user-1" });
  prismaMock.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === "function") return (arg as (tx: unknown) => unknown)(prismaMock);
    return Promise.all(arg as Promise<unknown>[]);
  });
});

describe("createPendingCommissionsForOrder — deterministic calculation and references", () => {
  it("creates a PENDING commission referencing order/beneficiary/level/rule/base/amount/status", async () => {
    mockFindActiveRules.mockResolvedValue([rule()]);
    mockGetAncestorChain.mockResolvedValue([{ level: 1, memberId: REFERRER_L1 }]);

    await createPendingCommissionsForOrder(
      prismaMock as never,
      { id: ORDER_ID, buyerId: BUYER_ID, buyerMemberId: BUYER_MEMBER_ID, platformFeeTotal: 0n },
      [{ itemType: "PRODUCT", lineTotal: 100000n }],
    );

    expect(mockCreateCommission).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({
        orderId: ORDER_ID,
        beneficiaryMemberId: REFERRER_L1,
        level: 1,
        ruleId: "rule-1",
        qualifyingEvent: "ORDER_COMPLETED",
        calculationBasis: "PERCENT_OF_ORDER",
        calculationBaseAmount: 100000n,
        rateBpsSnapshot: 500,
        amount: 5000n, // 5% of 100000
      }),
    );
    expect(mockCreateCommissionStatusHistory).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ fromStatus: null, toStatus: "PENDING" }),
    );
  });

  it("is deterministic — identical order/rule inputs always produce the identical commission amount", async () => {
    mockFindActiveRules.mockResolvedValue([rule({ rateValueBps: 333 })]);
    mockGetAncestorChain.mockResolvedValue([{ level: 1, memberId: REFERRER_L1 }]);

    const amounts: bigint[] = [];
    for (let i = 0; i < 5; i++) {
      mockFindExistingCommission.mockResolvedValue(null);
      await createPendingCommissionsForOrder(
        prismaMock as never,
        { id: `order-${i}`, buyerId: BUYER_ID, buyerMemberId: BUYER_MEMBER_ID, platformFeeTotal: 0n },
        [{ itemType: "PRODUCT", lineTotal: 777777n }],
      );
      const lastCall = mockCreateCommission.mock.calls.at(-1)?.[1] as { amount: bigint };
      amounts.push(lastCall.amount);
    }
    expect(new Set(amounts).size).toBe(1);
  });

  it("resolves direct (level 1) AND indirect (level 2) beneficiaries in one order", async () => {
    mockFindActiveRules.mockResolvedValue([
      rule({ id: "rule-l1", level: 1, rateValueBps: 500 }),
      rule({ id: "rule-l2", level: 2, rateValueBps: 200 }),
    ]);
    mockGetAncestorChain.mockResolvedValue([
      { level: 1, memberId: REFERRER_L1 },
      { level: 2, memberId: REFERRER_L2 },
    ]);

    await createPendingCommissionsForOrder(
      prismaMock as never,
      { id: ORDER_ID, buyerId: BUYER_ID, buyerMemberId: BUYER_MEMBER_ID, platformFeeTotal: 0n },
      [{ itemType: "PRODUCT", lineTotal: 100000n }],
    );

    expect(mockCreateCommission).toHaveBeenCalledTimes(2);
    expect(mockCreateCommission).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ beneficiaryMemberId: REFERRER_L1, level: 1, amount: 5000n }),
    );
    expect(mockCreateCommission).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ beneficiaryMemberId: REFERRER_L2, level: 2, amount: 2000n }),
    );
  });

  it("computes PERCENT_OF_PLATFORM_FEE against the order's platform fee, not the subtotal", async () => {
    mockFindActiveRules.mockResolvedValue([
      rule({ rateBasis: "PERCENT_OF_PLATFORM_FEE", rateValueBps: 1000 }),
    ]);
    mockGetAncestorChain.mockResolvedValue([{ level: 1, memberId: REFERRER_L1 }]);

    await createPendingCommissionsForOrder(
      prismaMock as never,
      { id: ORDER_ID, buyerId: BUYER_ID, buyerMemberId: BUYER_MEMBER_ID, platformFeeTotal: 300n },
      [{ itemType: "PRODUCT", lineTotal: 100000n }],
    );

    expect(mockCreateCommission).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ calculationBaseAmount: 300n, amount: 30n }),
    );
  });

  it("splits calculation base by catalog kind for a mixed-kind order", async () => {
    mockFindActiveRules.mockImplementation(async (appliesTo: string) =>
      appliesTo === "PRODUCT" ? [rule({ id: "rule-product", appliesTo: "PRODUCT", rateValueBps: 1000 })] : [],
    );
    mockGetAncestorChain.mockResolvedValue([{ level: 1, memberId: REFERRER_L1 }]);

    await createPendingCommissionsForOrder(
      prismaMock as never,
      { id: ORDER_ID, buyerId: BUYER_ID, buyerMemberId: BUYER_MEMBER_ID, platformFeeTotal: 0n },
      [
        { itemType: "PRODUCT", lineTotal: 10000n },
        { itemType: "SERVICE", lineTotal: 90000n },
      ],
    );

    // Only the PRODUCT portion (10000) counts, not the SERVICE portion (no matching rule).
    expect(mockCreateCommission).toHaveBeenCalledTimes(1);
    expect(mockCreateCommission).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ calculationBaseAmount: 10000n, amount: 1000n }),
    );
  });
});

describe("createPendingCommissionsForOrder — no commission created when it shouldn't be", () => {
  it("creates nothing when there's no active rule for the kind", async () => {
    mockFindActiveRules.mockResolvedValue([]);

    await createPendingCommissionsForOrder(
      prismaMock as never,
      { id: ORDER_ID, buyerId: BUYER_ID, buyerMemberId: BUYER_MEMBER_ID, platformFeeTotal: 0n },
      [{ itemType: "PRODUCT", lineTotal: 100000n }],
    );

    expect(mockCreateCommission).not.toHaveBeenCalled();
    expect(mockGetAncestorChain).not.toHaveBeenCalled();
  });

  it("creates nothing when the buyer has no referrer at all", async () => {
    mockFindActiveRules.mockResolvedValue([rule()]);
    mockGetAncestorChain.mockResolvedValue([]);

    await createPendingCommissionsForOrder(
      prismaMock as never,
      { id: ORDER_ID, buyerId: BUYER_ID, buyerMemberId: BUYER_MEMBER_ID, platformFeeTotal: 0n },
      [{ itemType: "PRODUCT", lineTotal: 100000n }],
    );

    expect(mockCreateCommission).not.toHaveBeenCalled();
  });

  it("creates nothing at level 2 when the referral chain is only 1 deep", async () => {
    mockFindActiveRules.mockResolvedValue([rule({ level: 2 })]);
    mockGetAncestorChain.mockResolvedValue([{ level: 1, memberId: REFERRER_L1 }]); // chain exhausted before level 2

    await createPendingCommissionsForOrder(
      prismaMock as never,
      { id: ORDER_ID, buyerId: BUYER_ID, buyerMemberId: BUYER_MEMBER_ID, platformFeeTotal: 0n },
      [{ itemType: "PRODUCT", lineTotal: 100000n }],
    );

    expect(mockCreateCommission).not.toHaveBeenCalled();
  });

  it("does not create a commission when the beneficiary fails the active-subscription requirement (Q-04)", async () => {
    mockFindActiveRules.mockResolvedValue([rule({ requiresActiveSubscription: true })]);
    mockGetAncestorChain.mockResolvedValue([{ level: 1, memberId: REFERRER_L1 }]);

    await createPendingCommissionsForOrder(
      prismaMock as never,
      { id: ORDER_ID, buyerId: BUYER_ID, buyerMemberId: BUYER_MEMBER_ID, platformFeeTotal: 0n },
      [{ itemType: "PRODUCT", lineTotal: 100000n }],
    );

    // No subscription system exists yet — see commission-service.ts's hasActiveSubscription() — so this never passes.
    expect(mockCreateCommission).not.toHaveBeenCalled();
  });

  it("does not create a commission when the beneficiary is below the minimum-activity threshold (Q-04)", async () => {
    mockFindActiveRules.mockResolvedValue([rule({ minimumActivityCount: 5 })]);
    mockGetAncestorChain.mockResolvedValue([{ level: 1, memberId: REFERRER_L1 }]);
    mockCountCompletedOrders.mockResolvedValue(2);

    await createPendingCommissionsForOrder(
      prismaMock as never,
      { id: ORDER_ID, buyerId: BUYER_ID, buyerMemberId: BUYER_MEMBER_ID, platformFeeTotal: 0n },
      [{ itemType: "PRODUCT", lineTotal: 100000n }],
    );

    expect(mockCreateCommission).not.toHaveBeenCalled();
  });

  it("creates a commission once the minimum-activity threshold is met", async () => {
    mockFindActiveRules.mockResolvedValue([rule({ minimumActivityCount: 5 })]);
    mockGetAncestorChain.mockResolvedValue([{ level: 1, memberId: REFERRER_L1 }]);
    mockCountCompletedOrders.mockResolvedValue(5);

    await createPendingCommissionsForOrder(
      prismaMock as never,
      { id: ORDER_ID, buyerId: BUYER_ID, buyerMemberId: BUYER_MEMBER_ID, platformFeeTotal: 0n },
      [{ itemType: "PRODUCT", lineTotal: 100000n }],
    );

    expect(mockCreateCommission).toHaveBeenCalledTimes(1);
  });

  it("does not create a duplicate commission for an (order, beneficiary, level) that already has one", async () => {
    mockFindActiveRules.mockResolvedValue([rule()]);
    mockGetAncestorChain.mockResolvedValue([{ level: 1, memberId: REFERRER_L1 }]);
    mockFindExistingCommission.mockResolvedValue({ id: "already-exists" });

    await createPendingCommissionsForOrder(
      prismaMock as never,
      { id: ORDER_ID, buyerId: BUYER_ID, buyerMemberId: BUYER_MEMBER_ID, platformFeeTotal: 0n },
      [{ itemType: "PRODUCT", lineTotal: 100000n }],
    );

    expect(mockCreateCommission).not.toHaveBeenCalled();
  });
});

describe("promoteCommissionsForCompletedOrder — Q-06", () => {
  it("moves PENDING commissions to ELIGIBLE and sets releaseAt from the rule's releaseDelayDays", async () => {
    mockListCommissionsForOrder.mockResolvedValue([
      { id: "commission-1", status: "PENDING", ruleId: "rule-1" },
    ]);
    prismaMock.commissionRule.findUnique.mockResolvedValue({ releaseDelayDays: 7 });

    const before = Date.now();
    await promoteCommissionsForCompletedOrder(ORDER_ID);

    expect(mockUpdateCommissionStatus).toHaveBeenCalledWith(
      prismaMock,
      "commission-1",
      "ELIGIBLE",
      expect.any(Date),
    );
    const releaseAt = mockUpdateCommissionStatus.mock.calls[0]?.[3] as Date;
    const daysAhead = (releaseAt.getTime() - before) / (24 * 60 * 60 * 1000);
    expect(daysAhead).toBeGreaterThan(6.9);
    expect(daysAhead).toBeLessThan(7.1);
  });

  it("leaves non-PENDING commissions untouched", async () => {
    mockListCommissionsForOrder.mockResolvedValue([
      { id: "commission-1", status: "AVAILABLE", ruleId: "rule-1" },
    ]);

    await promoteCommissionsForCompletedOrder(ORDER_ID);

    expect(mockUpdateCommissionStatus).not.toHaveBeenCalled();
  });
});

describe("reverseOrCancelCommissionsForOrder — Q-07 refund/cancellation safety", () => {
  it("cancels a still-PENDING commission (never confirmed owed)", async () => {
    mockListCommissionsForOrder.mockResolvedValue([{ id: "commission-1", status: "PENDING" }]);

    await reverseOrCancelCommissionsForOrder(ORDER_ID, "admin-1", "Order cancelled");

    expect(mockUpdateCommissionStatus).toHaveBeenCalledWith(prismaMock, "commission-1", "CANCELLED", undefined);
    expect(mockCreateCommissionStatusHistory).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({ fromStatus: "PENDING", toStatus: "CANCELLED", reason: "Order cancelled" }),
    );
  });

  it("reverses an ELIGIBLE commission (confirmed but not yet released)", async () => {
    mockListCommissionsForOrder.mockResolvedValue([{ id: "commission-1", status: "ELIGIBLE" }]);

    await reverseOrCancelCommissionsForOrder(ORDER_ID, "admin-1", "Order refunded");

    expect(mockUpdateCommissionStatus).toHaveBeenCalledWith(prismaMock, "commission-1", "REVERSED", undefined);
  });

  it("reverses an AVAILABLE commission and claws back the full amount from the wallet", async () => {
    mockListCommissionsForOrder.mockResolvedValue([
      { id: "commission-1", status: "AVAILABLE", amount: 5000n, beneficiaryMemberId: REFERRER_L1 },
    ]);
    mockDebitWalletUpTo.mockResolvedValue({ debited: 5000n });

    await reverseOrCancelCommissionsForOrder(ORDER_ID, "admin-1", "Order refunded");

    expect(mockUpdateCommissionStatus).toHaveBeenCalledWith(prismaMock, "commission-1", "REVERSED", undefined);
    expect(mockDebitWalletUpTo).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({
        walletId: "wallet-1",
        maxAmount: 5000n,
        idempotencyKey: "commission-reversed:commission-1",
      }),
    );
  });

  it("claws back only what's available and surfaces an uncovered shortfall rather than throwing", async () => {
    mockListCommissionsForOrder.mockResolvedValue([
      { id: "commission-1", status: "AVAILABLE", amount: 5000n, beneficiaryMemberId: REFERRER_L1 },
    ]);
    mockDebitWalletUpTo.mockResolvedValue({ debited: 2000n }); // already partly withdrawn

    await expect(
      reverseOrCancelCommissionsForOrder(ORDER_ID, "admin-1", "Order refunded"),
    ).resolves.not.toThrow();

    // The commission itself still moves to REVERSED — the wallet never goes negative (Q-07), it just can't fully recover.
    expect(mockUpdateCommissionStatus).toHaveBeenCalledWith(prismaMock, "commission-1", "REVERSED", undefined);
  });

  it("is idempotent — a commission already REVERSED or CANCELLED is left untouched, not double-processed", async () => {
    mockListCommissionsForOrder.mockResolvedValue([
      { id: "commission-1", status: "REVERSED" },
      { id: "commission-2", status: "CANCELLED" },
    ]);

    await reverseOrCancelCommissionsForOrder(ORDER_ID, "admin-1", "Second refund attempt");

    expect(mockUpdateCommissionStatus).not.toHaveBeenCalled();
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });

  it("reverses multiple commissions for a multi-level order in one call", async () => {
    mockListCommissionsForOrder.mockResolvedValue([
      { id: "commission-1", status: "AVAILABLE", amount: 5000n, beneficiaryMemberId: REFERRER_L1 },
      { id: "commission-2", status: "ELIGIBLE", amount: 2000n, beneficiaryMemberId: REFERRER_L2 },
    ]);
    mockDebitWalletUpTo.mockResolvedValue({ debited: 5000n });

    await reverseOrCancelCommissionsForOrder(ORDER_ID, "admin-1", "Order refunded");

    expect(mockUpdateCommissionStatus).toHaveBeenCalledTimes(2);
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "COMMISSIONS_REVERSED", entityId: ORDER_ID }),
    );
  });
});

describe("releaseEligibleCommissions — cron promotion to AVAILABLE", () => {
  it("promotes every ELIGIBLE commission past its releaseAt and credits the beneficiary's wallet", async () => {
    mockFindCommissionsPastReleaseAt.mockResolvedValue([
      { id: "commission-1", status: "ELIGIBLE", amount: 5000n, beneficiaryMemberId: REFERRER_L1 },
      { id: "commission-2", status: "ELIGIBLE", amount: 2000n, beneficiaryMemberId: REFERRER_L2 },
    ]);

    const count = await releaseEligibleCommissions(new Date());

    expect(count).toBe(2);
    expect(mockUpdateCommissionStatus).toHaveBeenCalledWith(prismaMock, "commission-1", "AVAILABLE", undefined);
    expect(mockUpdateCommissionStatus).toHaveBeenCalledWith(prismaMock, "commission-2", "AVAILABLE", undefined);
    expect(mockCreditWallet).toHaveBeenCalledWith(
      prismaMock,
      expect.objectContaining({
        walletId: "wallet-1",
        amount: 5000n,
        type: "COMMISSION",
        idempotencyKey: "commission-available:commission-1",
      }),
    );
    expect(mockCreditWallet).toHaveBeenCalledTimes(2);
  });

  it("does nothing when nothing is due yet", async () => {
    mockFindCommissionsPastReleaseAt.mockResolvedValue([]);

    const count = await releaseEligibleCommissions(new Date());

    expect(count).toBe(0);
    expect(mockUpdateCommissionStatus).not.toHaveBeenCalled();
  });
});
