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
  attachments: { select: { id: true, fileName: true, sizeBytes: true } },
} as const;

const LIST_LIMIT = 100;

export interface NewAttachment {
  storagePath: string;
  fileName: string;
  contentType: string;
  sizeBytes: number;
}

/** Saves a message, and the document sent with it if any, together: both are there or neither is. */
export async function createMessage(
  input: {
    fromUserId: string;
    toUserId: string | null;
    toStaff: boolean;
    subject: string;
    body: string;
  },
  attachment?: NewAttachment,
) {
  return prisma.message.create({
    data: { ...input, ...(attachment ? { attachments: { create: attachment } } : {}) },
    select: { id: true },
  });
}

/** One document, with what is needed to decide who may open it. */
export async function getAttachment(id: string) {
  return prisma.messageAttachment.findUnique({
    where: { id },
    select: {
      id: true,
      storagePath: true,
      fileName: true,
      message: { select: { id: true, fromUserId: true, toUserId: true, toStaff: true } },
    },
  });
}

// --- Drafts: a message to the team that was started and saved. Only its author can see or change it.

export function listDrafts(userId: string) {
  return prisma.messageDraft.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: LIST_LIMIT,
    select: { id: true, subject: true, body: true, updatedAt: true },
  });
}

export function getDraft(userId: string, id: string) {
  return prisma.messageDraft.findFirst({
    where: { id, userId },
    select: { id: true, subject: true, body: true },
  });
}

/** Creates a draft, or updates the one given (only if it is this person's own). Returns its id. */
export async function saveDraft(input: {
  userId: string;
  draftId?: string;
  subject: string;
  body: string;
}): Promise<string | null> {
  if (input.draftId) {
    const { count } = await prisma.messageDraft.updateMany({
      where: { id: input.draftId, userId: input.userId },
      data: { subject: input.subject, body: input.body },
    });
    return count === 1 ? input.draftId : null;
  }
  const created = await prisma.messageDraft.create({
    data: { userId: input.userId, subject: input.subject, body: input.body },
    select: { id: true },
  });
  return created.id;
}

export async function deleteDraft(userId: string, id: string): Promise<boolean> {
  const { count } = await prisma.messageDraft.deleteMany({ where: { id, userId } });
  return count === 1;
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
