import "server-only";
import { prisma } from "@/server/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import type { SubscriptionPlanType } from "@/generated/prisma/enums";

export interface CreatePlanInput {
  code: string;
  type: SubscriptionPlanType;
  price: bigint;
  durationDays: number | null;
  benefits: object | null;
  createdBy: string;
}

export async function createPlan(input: CreatePlanInput) {
  return prisma.subscriptionPlan.create({
    data: { ...input, benefits: input.benefits === null ? Prisma.JsonNull : input.benefits },
  });
}

export async function listPlans(activeOnly = false) {
  return prisma.subscriptionPlan.findMany({
    where: { deletedAt: null, ...(activeOnly ? { active: true } : {}) },
    orderBy: { createdAt: "desc" },
  });
}

export async function getPlanById(id: string) {
  return prisma.subscriptionPlan.findUnique({ where: { id } });
}

export async function setPlanActive(id: string, active: boolean) {
  return prisma.subscriptionPlan.update({ where: { id }, data: { active } });
}
