// No "server-only" import — orchestration layer, same rationale as
// wallet-service.ts. Nothing in this file ever passes a raw e-pin code to
// logger.*() — only codeLast4/epin id, per docs/security.md.
import { prisma } from "@/server/lib/prisma";
import {
  createEpin,
  createRedemption,
  findEpinByCodeHash,
  findExpiredFreshEpins,
  getEpinById,
  tryClaimFreshEpin,
  updateEpinStatus,
} from "@/server/repositories/epin/epin-repository";
import { createSubscription } from "@/server/repositories/subscription/subscription-repository";
import { getPlanById } from "@/server/repositories/subscription/subscription-plan-repository";
import { epinCodeLast4, generateEpinCode, hashEpinCode } from "@/server/domain/epin/epin-code";
import { computeSubscriptionExpiry } from "@/server/domain/subscription/subscription-math";
import { assertEpinTransition } from "@/server/domain/epin/epin-state-machine";
import { getFieldEncryptionKey } from "@/server/lib/field-encryption";
import { recordAudit } from "@/server/domain/audit/record";
import { ConflictError, NotFoundError, ValidationError } from "@/server/lib/errors";

export interface GenerateEpinInput {
  planId: string;
  generatedBy: string;
  expiresAt: Date | null;
}

export interface GenerateEpinResult {
  epinId: string;
  /** Shown to the generating admin ONCE — never persisted or logged in the clear. */
  rawCode: string;
  codeLast4: string;
}

export async function generateEpin(input: GenerateEpinInput): Promise<GenerateEpinResult> {
  const plan = await getPlanById(input.planId);
  if (!plan || !plan.active) {
    throw new ValidationError("That subscription plan is not available for e-pin generation.");
  }

  const key = getFieldEncryptionKey();
  const rawCode = generateEpinCode();
  const codeHash = hashEpinCode(rawCode, key);

  const epin = await createEpin({
    codeHash,
    codeLast4: epinCodeLast4(rawCode),
    planId: plan.id,
    price: plan.price,
    generatedBy: input.generatedBy,
    expiresAt: input.expiresAt,
  });

  await recordAudit({
    actorId: input.generatedBy,
    action: "EPIN_GENERATED",
    entityType: "epins",
    entityId: epin.id,
    after: { planId: plan.id, codeLast4: epin.codeLast4 },
  });

  return { epinId: epin.id, rawCode, codeLast4: epin.codeLast4 };
}

export interface RedeemEpinResult {
  subscriptionId: string;
  planCode: string;
}

/** Q-15: non-transferable — the redeeming account is permanently tied to this e-pin via the unique epin_id on epin_redemptions. */
export async function redeemEpin(userId: string, memberId: string, rawCode: string): Promise<RedeemEpinResult> {
  const key = getFieldEncryptionKey();
  const codeHash = hashEpinCode(rawCode, key);
  const epin = await findEpinByCodeHash(codeHash);

  if (!epin) {
    throw new NotFoundError("That e-pin code is not valid.");
  }

  if (epin.status === "FRESH" && epin.expiresAt && epin.expiresAt.getTime() <= Date.now()) {
    await prisma.$transaction((tx) => updateEpinStatus(tx, epin.id, assertEpinTransition("FRESH", "EXPIRED", "SYSTEM")));
    throw new ConflictError("This e-pin has expired.");
  }

  if (epin.status !== "FRESH") {
    const messages: Record<string, string> = {
      USED: "This e-pin has already been redeemed.",
      EXPIRED: "This e-pin has expired.",
      REVOKED: "This e-pin is no longer valid.",
    };
    throw new ConflictError(messages[epin.status] ?? "This e-pin cannot be redeemed.");
  }

  const plan = await getPlanById(epin.planId);
  if (!plan) {
    throw new ValidationError("The plan behind this e-pin no longer exists.");
  }

  const startsAt = new Date();
  const expiresAt = computeSubscriptionExpiry({ type: plan.type, durationDays: plan.durationDays }, startsAt);

  assertEpinTransition("FRESH", "USED", "MEMBER"); // policy check — the actual race defense is tryClaimFreshEpin() below

  const result = await prisma.$transaction(async (tx) => {
    const claimed = await tryClaimFreshEpin(tx, epin.id);
    if (!claimed) {
      // Lost the race to a concurrent redemption of the same e-pin (or it
      // was expired/revoked between the read above and this write) —
      // never create a second subscription for the same code.
      throw new ConflictError("This e-pin has already been redeemed.");
    }

    const subscription = await createSubscription(tx, { memberId, planId: plan.id, startsAt, expiresAt });
    await createRedemption(tx, { epinId: epin.id, redeemedBy: userId, resultingSubscriptionId: subscription.id });

    return subscription;
  });

  await recordAudit({
    actorId: userId,
    action: "EPIN_REDEEMED",
    entityType: "epins",
    entityId: epin.id,
    after: { codeLast4: epin.codeLast4, subscriptionId: result.id },
  });

  return { subscriptionId: result.id, planCode: plan.code };
}

export async function revokeEpin(epinId: string, actorId: string): Promise<void> {
  const epin = await getEpinById(epinId);
  if (!epin) throw new NotFoundError("E-pin not found.");

  assertEpinTransition(epin.status, "REVOKED", "ADMIN");
  await prisma.$transaction((tx) => updateEpinStatus(tx, epinId, "REVOKED"));

  await recordAudit({
    actorId,
    action: "EPIN_REVOKED",
    entityType: "epins",
    entityId: epinId,
    after: { codeLast4: epin.codeLast4 },
  });
}

/** Cron entry point — expires FRESH e-pins past their configured expiry. */
export async function expireFreshEpins(now: Date = new Date()): Promise<number> {
  const due = await findExpiredFreshEpins(now);
  if (due.length === 0) return 0;

  await prisma.$transaction(async (tx) => {
    for (const epin of due) {
      await updateEpinStatus(tx, epin.id, assertEpinTransition("FRESH", "EXPIRED", "SYSTEM"));
    }
  });

  return due.length;
}
