import "server-only";
import { prisma } from "@/server/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

export async function createSubscription(
  tx: Tx,
  input: { memberId: string; planId: string; startsAt: Date; expiresAt: Date | null },
) {
  return tx.subscription.create({ data: input });
}

export async function getActiveSubscriptionForMember(memberId: string) {
  return prisma.subscription.findFirst({
    where: { memberId, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    include: { plan: true },
  });
}

export async function listSubscriptionsForMember(memberId: string) {
  return prisma.subscription.findMany({
    where: { memberId },
    orderBy: { createdAt: "desc" },
    include: { plan: true },
  });
}

export async function findExpiredActiveSubscriptions(now: Date = new Date()) {
  return prisma.subscription.findMany({
    where: { status: "ACTIVE", expiresAt: { lte: now } },
  });
}

export async function updateSubscriptionStatus(tx: Tx, id: string, status: "ACTIVE" | "EXPIRED" | "CANCELLED") {
  return tx.subscription.update({ where: { id }, data: { status } });
}
