import "server-only";
import { prisma } from "@/server/lib/prisma";
import type { AddressType } from "@/generated/prisma/enums";
import type { AddressInput } from "@/lib/schemas/member";

export async function listAddresses(ownerUserId: string) {
  return prisma.address.findMany({
    where: { ownerUserId, deletedAt: null },
    orderBy: { type: "asc" },
  });
}

/**
 * One address per type per user — a resubmission for the same type replaces
 * the existing row (soft-deletes the old one) rather than accumulating
 * duplicates, since the profile UI only ever shows one Residence/Office
 * address at a time.
 */
export async function upsertAddress(ownerUserId: string, input: AddressInput) {
  const existing = await prisma.address.findFirst({
    where: { ownerUserId, type: input.type as AddressType, deletedAt: null },
  });

  if (existing) {
    return prisma.address.update({
      where: { id: existing.id },
      data: {
        line1: input.line1,
        line2: input.line2 ?? null,
        city: input.city,
        state: input.state,
        postalCode: input.postalCode,
        country: input.country,
      },
    });
  }

  return prisma.address.create({
    data: {
      ownerUserId,
      type: input.type as AddressType,
      line1: input.line1,
      line2: input.line2 ?? null,
      city: input.city,
      state: input.state,
      postalCode: input.postalCode,
      country: input.country,
    },
  });
}
