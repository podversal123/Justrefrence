// No "server-only" import — orchestration layer; every dependency below
// already carries its own "server-only" guard. Same precedent as
// checkout-service.ts (Phase 5) and registration-service.ts (Phase 4).
import { prisma } from "@/server/lib/prisma";
import { findActiveRules } from "@/server/repositories/commission/commission-rule-repository";
import {
  createCommission,
  createCommissionStatusHistory,
  findCommissionsPastReleaseAt,
  findExistingCommission,
  listCommissionsForOrder,
  updateCommissionStatus,
} from "@/server/repositories/commission/commission-repository";
import { countCompletedOrders, getAncestorChain } from "@/server/repositories/referral/referral-repository";
import {
  creditWallet,
  debitWalletUpTo,
  getOrCreateWalletTx,
} from "@/server/repositories/wallet/wallet-repository";
import { computeCommissionAmount } from "@/server/domain/commission/commission-math";
import { evaluateEligibility } from "@/server/domain/commission/eligibility";
import { assertCommissionTransition, type CommissionActorRole } from "@/server/domain/commission/commission-state-machine";
import { recordAudit } from "@/server/domain/audit/record";
import { logger } from "@/server/lib/logger";
import type { Prisma } from "@/generated/prisma/client";
import type { CatalogItemKind, CommissionApplicableTo } from "@/generated/prisma/enums";

type Tx = Prisma.TransactionClient;

/**
 * No Subscription model exists yet in this codebase (Q-16/Q-17 are
 * unresolved — see docs/business-rules.md). A rule with
 * requiresActiveSubscription=true is therefore honestly unsatisfiable
 * until that phase lands; this returns false rather than guessing. See
 * docs/adr/0014-commission-engine.md.
 */
async function hasActiveSubscription(_userId: string): Promise<boolean> {
  return false;
}

interface OrderLine {
  itemType: CatalogItemKind;
  lineTotal: bigint;
}

function groupSubtotalByKind(items: OrderLine[]): Map<CatalogItemKind, bigint> {
  const byKind = new Map<CatalogItemKind, bigint>();
  for (const item of items) {
    byKind.set(item.itemType, (byKind.get(item.itemType) ?? 0n) + item.lineTotal);
  }
  return byKind;
}

function resolveCalculationBase(
  rateBasis: "PERCENT_OF_ORDER" | "PERCENT_OF_VENDOR_SALE" | "PERCENT_OF_PLATFORM_FEE" | "FIXED",
  kindSubtotal: bigint,
  platformFeeTotal: bigint,
): bigint {
  if (rateBasis === "PERCENT_OF_PLATFORM_FEE") return platformFeeTotal;
  if (rateBasis === "FIXED") return 0n;
  return kindSubtotal; // PERCENT_OF_ORDER and PERCENT_OF_VENDOR_SALE are the same number here — see docs/adr/0014.
}

/**
 * Creates PENDING commissions for one order, inside the SAME transaction
 * checkout-service.ts already runs order creation in (atomic with the
 * order itself — see docs/adr/0014). Eligibility (Q-04) is evaluated here,
 * once, at creation time, not retroactively: an ineligible beneficiary
 * simply gets no commission row for this order/level, full stop.
 */
export async function createPendingCommissionsForOrder(
  tx: Tx,
  order: { id: string; buyerId: string; buyerMemberId: string; platformFeeTotal: bigint },
  items: OrderLine[],
): Promise<void> {
  const subtotalByKind = groupSubtotalByKind(items);
  if (subtotalByKind.size === 0) return;

  // Only walk as many ancestor hops as the highest active level across all
  // represented kinds actually needs — Q-01: unlimited depth is supported,
  // but only configured levels ever pay out.
  const rulesByKind = new Map<CatalogItemKind, Awaited<ReturnType<typeof findActiveRules>>>();
  let maxLevel = 0;
  for (const kind of subtotalByKind.keys()) {
    const rules = await findActiveRules(kind as unknown as CommissionApplicableTo, "ORDER_COMPLETED");
    rulesByKind.set(kind, rules);
    for (const rule of rules) maxLevel = Math.max(maxLevel, rule.level);
  }
  if (maxLevel === 0) return; // no active rule for anything in this order

  const ancestorChain = await getAncestorChain(order.buyerMemberId, maxLevel);
  if (ancestorChain.length === 0) return; // buyer has no referrer at all — nothing to pay

  for (const [kind, kindSubtotal] of subtotalByKind) {
    const rules = rulesByKind.get(kind) ?? [];
    for (const rule of rules) {
      const ancestor = ancestorChain.find((a) => a.level === rule.level);
      if (!ancestor) continue; // chain doesn't reach this level

      const existing = await findExistingCommission(tx, order.id, ancestor.memberId, rule.level);
      if (existing) continue; // already created — structural idempotency guard

      const referrer = await tx.memberProfile.findUnique({
        where: { id: ancestor.memberId },
        select: { userId: true },
      });
      if (!referrer) continue;

      const eligibility = evaluateEligibility(
        { requiresActiveSubscription: rule.requiresActiveSubscription, minimumActivityCount: rule.minimumActivityCount },
        {
          hasActiveSubscription: await hasActiveSubscription(referrer.userId),
          activityCount: await countCompletedOrders(referrer.userId),
        },
      );
      if (!eligibility.eligible) continue; // Q-04: no retroactive re-check — simply never created

      const calculationBaseAmount = resolveCalculationBase(rule.rateBasis, kindSubtotal, order.platformFeeTotal);
      const amount = computeCommissionAmount(
        { rateBasis: rule.rateBasis, rateValueBps: rule.rateValueBps, rateValueFixed: rule.rateValueFixed },
        calculationBaseAmount,
      );
      if (amount <= 0n) continue; // nothing to credit

      const commission = await createCommission(tx, {
        orderId: order.id,
        beneficiaryMemberId: ancestor.memberId,
        level: rule.level,
        ruleId: rule.id,
        qualifyingEvent: "ORDER_COMPLETED",
        calculationBasis: rule.rateBasis,
        calculationBaseAmount,
        rateBpsSnapshot: rule.rateValueBps,
        rateFixedSnapshot: rule.rateValueFixed,
        amount,
      });

      await createCommissionStatusHistory(tx, {
        commissionId: commission.id,
        fromStatus: null,
        toStatus: "PENDING",
        actorId: null,
      });
    }
  }
}

async function transitionAndRecord(
  tx: Tx,
  commissionId: string,
  from: Parameters<typeof assertCommissionTransition>[0],
  to: Parameters<typeof assertCommissionTransition>[1],
  actorRole: CommissionActorRole,
  actorId: string | null,
  reason: string | null,
  releaseAt?: Date | null,
) {
  assertCommissionTransition(from, to, actorRole);
  await updateCommissionStatus(tx, commissionId, to, releaseAt);
  await createCommissionStatusHistory(tx, { commissionId, fromStatus: from, toStatus: to, actorId, reason });
}

/** Called when an order reaches COMPLETED — docs/business-rules.md Q-06. */
export async function promoteCommissionsForCompletedOrder(orderId: string): Promise<void> {
  const commissions = await listCommissionsForOrder(orderId);
  const pending = commissions.filter((c) => c.status === "PENDING");
  if (pending.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const commission of pending) {
      const rule = await tx.commissionRule.findUnique({ where: { id: commission.ruleId } });
      const releaseDelayDays = rule?.releaseDelayDays ?? 0;
      const releaseAt = new Date(Date.now() + releaseDelayDays * 24 * 60 * 60 * 1000);
      await transitionAndRecord(tx, commission.id, "PENDING", "ELIGIBLE", "SYSTEM", null, null, releaseAt);
    }
  });
}

/** Called when an order is CANCELLED or REFUNDED — docs/business-rules.md Q-07. Idempotent: already-terminal commissions are left untouched. */
export async function reverseOrCancelCommissionsForOrder(
  orderId: string,
  actorId: string | null,
  reason: string,
): Promise<void> {
  const commissions = await listCommissionsForOrder(orderId);
  const actionable = commissions.filter((c) => c.status === "PENDING" || c.status === "ELIGIBLE" || c.status === "AVAILABLE");
  if (actionable.length === 0) return;

  await prisma.$transaction(async (tx) => {
    for (const commission of actionable) {
      const wasAvailable = commission.status === "AVAILABLE";
      const to = commission.status === "PENDING" ? "CANCELLED" : "REVERSED";
      await transitionAndRecord(tx, commission.id, commission.status, to, "SYSTEM", actorId, reason);

      // Q-07: only an AVAILABLE commission was ever actually credited to the
      // wallet — claw it back. ELIGIBLE/PENDING commissions never touched
      // the wallet, so there's nothing to reverse there.
      if (wasAvailable) {
        const beneficiary = await tx.memberProfile.findUnique({
          where: { id: commission.beneficiaryMemberId },
          select: { userId: true },
        });
        if (!beneficiary) continue;

        const wallet = await getOrCreateWalletTx(tx, beneficiary.userId);
        const { debited } = await debitWalletUpTo(tx, {
          walletId: wallet.id,
          maxAmount: commission.amount,
          type: "ADJUSTMENT",
          referenceType: "COMMISSION",
          referenceId: commission.id,
          idempotencyKey: `commission-reversed:${commission.id}`,
        });

        if (debited < commission.amount) {
          // Q-07: wallet never goes negative — whatever couldn't be clawed
          // back (already paid out) is an uncovered shortfall, surfaced
          // here for FINANCE rather than silently absorbed. Automatic
          // netting against the member's future commission credits is not
          // implemented in this phase — see docs/adr/0015.
          logger.error("commission_reversal_shortfall", {
            commissionId: commission.id,
            beneficiaryMemberId: commission.beneficiaryMemberId,
            fullAmount: commission.amount.toString(),
            recovered: debited.toString(),
            shortfall: (commission.amount - debited).toString(),
          });
        }
      }
    }
  });

  await recordAudit({
    actorId,
    action: "COMMISSIONS_REVERSED",
    entityType: "orders",
    entityId: orderId,
    after: { reason, affected: actionable.length },
  });
}

/**
 * Cron entry point — promotes ELIGIBLE commissions whose release window has
 * elapsed to AVAILABLE and, in the same transaction, credits the
 * beneficiary's wallet (Phase 7 closes the loop Phase 6 left open — see
 * the schema comment on CommissionStatus.AVAILABLE). The idempotency key
 * is deterministic from the commission's own id, so a re-run of this cron
 * can never double-credit.
 */
export async function releaseEligibleCommissions(now: Date = new Date()): Promise<number> {
  const due = await findCommissionsPastReleaseAt(now);
  if (due.length === 0) return 0;

  await prisma.$transaction(async (tx) => {
    for (const commission of due) {
      await transitionAndRecord(tx, commission.id, "ELIGIBLE", "AVAILABLE", "SYSTEM", null, null);

      const beneficiary = await tx.memberProfile.findUnique({
        where: { id: commission.beneficiaryMemberId },
        select: { userId: true },
      });
      if (!beneficiary) continue;

      const wallet = await getOrCreateWalletTx(tx, beneficiary.userId);
      await creditWallet(tx, {
        walletId: wallet.id,
        amount: commission.amount,
        type: "COMMISSION",
        referenceType: "COMMISSION",
        referenceId: commission.id,
        idempotencyKey: `commission-available:${commission.id}`,
      });
    }
  });

  return due.length;
}
