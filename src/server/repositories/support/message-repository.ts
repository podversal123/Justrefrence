import "server-only";
import { prisma } from "@/server/lib/prisma";

const MESSAGE_SELECT = {
  id: true,
  subject: true,
  body: true,
  toStaff: true,
  readAt: true,
  createdAt: true,
  from: { select: { id: true, fullName: true, email: true } },
  to: { select: { id: true, fullName: true, email: true } },
} as const;

const LIST_LIMIT = 100;

export async function createMessage(input: {
  fromUserId: string;
  toUserId: string | null;
  toStaff: boolean;
  subject: string;
  body: string;
}) {
  return prisma.message.create({ data: input, select: { id: true } });
}

/** Messages addressed to this user personally. */
export async function listInbox(userId: string) {
  return prisma.message.findMany({
    where: { toUserId: userId },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
    select: MESSAGE_SELECT,
  });
}

/** Messages members sent "to the team" — the shared staff inbox. */
export async function listStaffInbox() {
  return prisma.message.findMany({
    where: { toStaff: true },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
    select: MESSAGE_SELECT,
  });
}

export async function listSent(userId: string) {
  return prisma.message.findMany({
    where: { fromUserId: userId },
    orderBy: { createdAt: "desc" },
    take: LIST_LIMIT,
    select: MESSAGE_SELECT,
  });
}

export async function getMessage(id: string) {
  return prisma.message.findUnique({
    where: { id },
    select: { ...MESSAGE_SELECT, fromUserId: true, toUserId: true },
  });
}

export async function markMessageRead(id: string) {
  await prisma.message.updateMany({ where: { id, readAt: null }, data: { readAt: new Date() } });
}

export async function countUnreadFor(userId: string, includeStaffInbox: boolean) {
  return prisma.message.count({
    where: {
      readAt: null,
      OR: [{ toUserId: userId }, ...(includeStaffInbox ? [{ toStaff: true }] : [])],
    },
  });
}

/** Recipient picker for staff: active members and vendors, newest first. */
export async function listRecipientCandidates(search?: string) {
  const term = search?.trim();
  return prisma.user.findMany({
    where: {
      status: "ACTIVE",
      ...(term
        ? {
            OR: [
              { email: { contains: term, mode: "insensitive" } },
              { fullName: { contains: term, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      fullName: true,
      email: true,
      vendorProfile: { select: { businessName: true } },
    },
  });
}
