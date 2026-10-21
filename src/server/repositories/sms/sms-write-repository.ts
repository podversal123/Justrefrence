// Deliberately NO "server-only" import: same exception and rationale as wallet-repository.ts. The SMS service is
// tested against a fake database client, and the only dependency (`@/server/lib/prisma`) carries the guard.
import { prisma } from "@/server/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/** The one active member with this email (any letter case), with their mobile number. */
export function findActiveMemberByEmail(email: string) {
  return prisma.user.findFirst({
    where: {
      email: { equals: email, mode: "insensitive" },
      status: "ACTIVE",
      memberProfile: { isNot: null },
    },
    select: { id: true, phone: true },
  });
}

/** Active members (only approved vendors when asked), at most `take`, with their mobile numbers. */
export function findActiveMembersForSms(onlyApprovedVendors: boolean, take: number) {
  return prisma.user.findMany({
    where: {
      status: "ACTIVE",
      memberProfile: { isNot: null },
      ...(onlyApprovedVendors ? { vendorProfile: { approvalStatus: "APPROVED" } } : {}),
    },
    select: { id: true, phone: true },
    take,
  });
}

/** A member with this email, active or not, for addressing a draft. */
export function findMemberByEmailForDraft(email: string) {
  return prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" }, memberProfile: { isNot: null } },
    select: { id: true },
  });
}

/** Queues one message per recipient and clears the draft they were sent from, all or nothing. */
export function queueSmsBatch(input: {
  batchKey: string;
  senderId: string;
  recipients: { userId: string; phone: string }[];
  body: string;
  draftId: string | undefined;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.smsMessage.createMany({
      data: input.recipients.map((r) => ({
        batchKey: input.batchKey,
        senderId: input.senderId,
        recipientUserId: r.userId,
        phone: r.phone,
        body: input.body,
        status: "QUEUED" as const,
      })),
    });
    if (input.draftId) {
      await tx.smsDraft.deleteMany({ where: { id: input.draftId, authorId: input.senderId } });
    }
    return tx.smsMessage.findMany({
      where: { batchKey: input.batchKey },
      select: { id: true, recipientUserId: true, phone: true },
    });
  });
}

export function updateSmsMessage(id: string, data: Prisma.SmsMessageUncheckedUpdateInput) {
  return prisma.smsMessage.update({ where: { id }, data });
}

export function findSmsBatchStatuses(batchKey: string) {
  return prisma.smsMessage.findMany({
    where: { batchKey },
    select: { status: true, provider: true },
  });
}

/** Updates a draft only if it belongs to this author. Returns how many rows changed. */
export async function updateSmsDraft(
  id: string,
  authorId: string,
  data: Prisma.SmsDraftUncheckedUpdateManyInput,
): Promise<number> {
  const moved = await prisma.smsDraft.updateMany({ where: { id, authorId }, data });
  return moved.count;
}

export function createSmsDraft(data: Prisma.SmsDraftUncheckedCreateInput) {
  return prisma.smsDraft.create({ data, select: { id: true } });
}

export async function deleteSmsDraft(id: string, authorId: string): Promise<number> {
  const result = await prisma.smsDraft.deleteMany({ where: { id, authorId } });
  return result.count;
}

export function markSmsReadForUser(userId: string, smsId: string) {
  return prisma.smsMessage.updateMany({
    where: { id: smsId, recipientUserId: userId, readAt: null },
    data: { readAt: new Date() },
  });
}

export function markAllSmsReadForUser(userId: string) {
  return prisma.smsMessage.updateMany({
    where: { recipientUserId: userId, readAt: null, status: "SENT" },
    data: { readAt: new Date() },
  });
}
