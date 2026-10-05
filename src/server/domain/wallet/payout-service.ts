// No "server-only" import — orchestration layer, same rationale as
// wallet-service.ts.
import { prisma } from "@/server/lib/prisma";
import {
  createPayoutRequest,
  createPayoutTransaction,
  getPayoutRequestById,
  updatePayoutStatus,
} from "@/server/repositories/wallet/payout-repository";
import {
  getOrCreateWallet,
  holdForPayout,
  recordLedgerEntry,
  releaseHoldAsPaid,
  releaseHoldToBalance,
} from "@/server/repositories/wallet/wallet-repository";
import {
  evaluatePayoutEligibility,
  payoutEligibilityMessage,
} from "@/server/domain/wallet/payout-eligibility";
import { assertWalletPinIfSet } from "@/server/domain/wallet/wallet-service";
import {
  assertPayoutTransition,
  type PayoutActorRole,
  type PayoutStatus,
} from "@/server/domain/wallet/payout-state-machine";
import { recordAudit } from "@/server/domain/audit/record";
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from "@/server/lib/errors";
import { isUniqueConstraintViolation, scopedIdempotencyKey } from "@/server/lib/idempotency";

/** Key-independent double-submit window: an identical REQUESTED payout this recent is treated as a duplicate even under a fresh idempotency key. */
const DUPLICATE_PAYOUT_WINDOW_MS = 60_000;

export interface RequestPayoutInput {
  bankAccountId: string;
  amount: bigint;
  idempotencyKey: string;
  walletPin?: string;
}

/** Q-11 eligibility + Q-13 optional PIN + atomic fund hold — all inside one transaction. */
export async function requestPayout(userId: string, input: RequestPayoutInput) {
  if (input.amount <= 0n) {
    throw new ValidationError("Enter a payout amount greater than zero.");
  }

  const [user, memberProfile, bankAccount] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: userId } }),
    prisma.memberProfile.findUnique({ where: { userId } }),
    prisma.bankAccount.findFirst({ where: { id: input.bankAccountId, userId, deletedAt: null } }),
  ]);

  if (!bankAccount) {
    throw new NotFoundError("That bank account was not found on your profile.");
  }

  const eligibility = evaluatePayoutEligibility({
    emailVerified: user.emailVerifiedAt !== null,
    hasPan: Boolean(memberProfile?.pan),
    hasVerifiedBankAccount: bankAccount.verifiedAt !== null,
  });
  if (!eligibility.eligible) {
    throw new ValidationError(payoutEligibilityMessage(eligibility.failure!));
  }

  const wallet = await getOrCreateWallet(userId);
  await assertWalletPinIfSet(wallet.id, input.walletPin);

  const idempotencyKey = scopedIdempotencyKey("payout", userId, input.idempotencyKey);

  // Idempotent replay: referenceId on the existing ledger entry IS the
  // payout request id it was recorded for (see recordLedgerEntry() call
  // below) — return that same request instead of creating a new one.
  const replay = async () => {
    const existing = await prisma.walletTransaction.findUnique({ where: { idempotencyKey } });
    if (!existing) return null;
    const request = await prisma.payoutRequest.findUnique({ where: { id: existing.referenceId } });
    if (!request) return null;
    if (
      request.walletId !== wallet.id ||
      request.amount !== input.amount ||
      request.bankAccountId !== input.bankAccountId
    ) {
      throw new ConflictError(
        "This request id was already used for a different payout. Refresh and try again.",
      );
    }
    return request;
  };

  const replayed = await replay();
  if (replayed) return replayed;

  const recentDuplicate = await prisma.payoutRequest.findFirst({
    where: {
      walletId: wallet.id,
      bankAccountId: input.bankAccountId,
      amount: input.amount,
      status: "REQUESTED",
      createdAt: { gte: new Date(Date.now() - DUPLICATE_PAYOUT_WINDOW_MS) },
    },
    select: { id: true },
  });
  if (recentDuplicate) {
    throw new ConflictError(
      "An identical payout request was just submitted. Check your payout history before retrying.",
    );
  }

  let result;
  try {
    result = await prisma.$transaction(async (tx) => {
      const request = await createPayoutRequest(tx, {
        walletId: wallet.id,
        bankAccountId: input.bankAccountId,
        amount: input.amount,
        requestedBy: userId,
      });

      const held = await holdForPayout(tx, wallet.id, input.amount);
      if (!held) {
        throw new ValidationError("Insufficient wallet balance for this payout amount.");
      }

      // The balance move already happened in holdForPayout() above — this
      // records that fact in the permanent, insert-only ledger without
      // touching the balance a second time. See recordLedgerEntry()'s doc
      // comment in wallet-repository.ts.
      await recordLedgerEntry(tx, {
        walletId: wallet.id,
        direction: "DEBIT",
        amount: input.amount,
        type: "PAYOUT",
        referenceType: "PAYOUT_REQUEST",
        referenceId: request.id,
        idempotencyKey,
      });

      return request;
    });
  } catch (error) {
    // Concurrent same-key submission — the unique ledger key rejected the
    // loser and its transaction (including the fund hold) rolled back.
    if (isUniqueConstraintViolation(error)) {
      const winner = await replay();
      if (winner) return winner;
    }
    throw error;
  }

  await recordAudit({
    actorId: userId,
    action: "PAYOUT_REQUESTED",
    entityType: "payout_requests",
    entityId: result.id,
    after: { amount: input.amount.toString(), bankAccountId: input.bankAccountId },
  });

  return result;
}

interface TransitionActor {
  userId: string;
  role: PayoutActorRole;
}

export async function transitionPayoutStatus(
  payoutRequestId: string,
  toStatus: PayoutStatus,
  actor: TransitionActor,
  extra?: { rejectedReason?: string; transferReference?: string; tdsDeducted?: bigint },
) {
  const request = await getPayoutRequestById(payoutRequestId);
  if (!request) throw new NotFoundError("Payout request not found.");

  if (toStatus === "APPROVED" && request.requestedBy === actor.userId) {
    throw new AuthorizationError(
      "A payout cannot be approved by the same person who requested it.",
    );
  }

  assertPayoutTransition(request.status, toStatus, actor.role);

  if (toStatus === "REJECTED") {
    if (!extra?.rejectedReason)
      throw new ValidationError("A reason is required when rejecting a payout.");
    await prisma.$transaction(async (tx) => {
      await releaseHoldToBalance(tx, request.walletId, request.amount);
      await updatePayoutStatus(tx, payoutRequestId, "REJECTED", {
        rejectedReason: extra.rejectedReason,
      });
    });
  } else if (toStatus === "PAID") {
    const tdsDeducted = extra?.tdsDeducted ?? 0n;
    const netAmount = request.amount - tdsDeducted;
    await prisma.$transaction(async (tx) => {
      await releaseHoldAsPaid(tx, request.walletId, request.amount);
      await createPayoutTransaction(tx, {
        payoutRequestId,
        transferReference: extra?.transferReference ?? null,
        tdsDeducted,
        netAmount,
        paidAt: new Date(),
        recordedBy: actor.userId,
      });
      await updatePayoutStatus(tx, payoutRequestId, "PAID", { approvedBy: request.approvedBy });
    });
  } else {
    const approvedBy = toStatus === "APPROVED" ? actor.userId : request.approvedBy;
    await prisma.$transaction((tx) =>
      updatePayoutStatus(tx, payoutRequestId, toStatus, { approvedBy }),
    );
  }

  await recordAudit({
    actorId: actor.userId,
    action: "PAYOUT_STATUS_CHANGED",
    entityType: "payout_requests",
    entityId: payoutRequestId,
    before: { status: request.status },
    after: { status: toStatus },
  });

  return getPayoutRequestById(payoutRequestId);
}
