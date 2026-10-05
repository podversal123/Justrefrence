import "server-only";
import { prisma } from "@/server/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { CommissionApplicableTo, CommissionQualifyingEvent } from "@/generated/prisma/enums";

/**
 * `commission_rules` is "versioned via effective_to, never deleted" — see
 * docs/database-tables.md §5 and docs/adr/0014-commission-engine.md.
 * Nothing in this repository ever edits a rule's rate/level/basis in
 * place; createRuleVersion() is the only write path for a new rate.
 */

export async function findActiveRules(
  appliesTo: CommissionApplicableTo,
  qualifyingEvent: CommissionQualifyingEvent,
  now: Date = new Date(),
) {
  return prisma.commissionRule.findMany({
    where: {
      appliesTo,
      qualifyingEvent,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    },
    orderBy: { level: "asc" },
  });
}

export async function getActiveRuleForLevel(
  appliesTo: CommissionApplicableTo,
  qualifyingEvent: CommissionQualifyingEvent,
  level: number,
  now: Date = new Date(),
) {
  return prisma.commissionRule.findFirst({
    where: {
      appliesTo,
      qualifyingEvent,
      level,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gt: now } }],
    },
  });
}

export async function getRuleById(id: string) {
  return prisma.commissionRule.findUnique({ where: { id } });
}

export async function listRules() {
  return prisma.commissionRule.findMany({
    orderBy: [{ appliesTo: "asc" }, { level: "asc" }, { effectiveFrom: "desc" }],
  });
}

export interface CreateRuleVersionInput {
  level: number;
  appliesTo: CommissionApplicableTo;
  rateBasis: "PERCENT_OF_ORDER" | "PERCENT_OF_VENDOR_SALE" | "PERCENT_OF_PLATFORM_FEE" | "FIXED";
  rateValueBps: number | null;
  rateValueFixed: bigint | null;
  qualifyingEvent: CommissionQualifyingEvent;
  requiresActiveSubscription: boolean;
  minimumActivityCount: number | null;
  releaseDelayDays: number;
  createdBy: string;
}

/**
 * Closes the currently-active rule (if any) for this exact (level,
 * appliesTo, qualifyingEvent) combination and inserts the new version —
 * both inside one transaction, so there's never a gap where neither row is
 * "active" nor a moment where two rows are simultaneously active for the
 * same configuration.
 */
export async function createRuleVersion(input: CreateRuleVersionInput) {
  return prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const now = new Date();
    const current = await tx.commissionRule.findFirst({
      where: {
        level: input.level,
        appliesTo: input.appliesTo,
        qualifyingEvent: input.qualifyingEvent,
        effectiveTo: null,
      },
    });

    if (current) {
      await tx.commissionRule.update({ where: { id: current.id }, data: { effectiveTo: now } });
    }

    return tx.commissionRule.create({
      data: {
        level: input.level,
        appliesTo: input.appliesTo,
        rateBasis: input.rateBasis,
        rateValueBps: input.rateValueBps,
        rateValueFixed: input.rateValueFixed,
        qualifyingEvent: input.qualifyingEvent,
        requiresActiveSubscription: input.requiresActiveSubscription,
        minimumActivityCount: input.minimumActivityCount,
        releaseDelayDays: input.releaseDelayDays,
        effectiveFrom: now,
        createdBy: input.createdBy,
      },
    });
  });
}
