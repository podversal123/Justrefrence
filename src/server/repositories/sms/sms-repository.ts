import "server-only";
import { prisma } from "@/server/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { SmsStatus } from "@/generated/prisma/enums";

const PAGE_SIZE = 20;

const OUTBOX_SELECT = {
  id: true,
  body: true,
  phone: true,
  status: true,
  provider: true,
  failureReason: true,
  createdAt: true,
  sentAt: true,
  recipient: { select: { fullName: true, email: true } },
  sender: { select: { fullName: true, email: true } },
} satisfies Prisma.SmsMessageSelect;

export type OutboxRow = Prisma.SmsMessageGetPayload<{ select: typeof OUTBOX_SELECT }>;

export interface OutboxFilter {
  status?: SmsStatus;
  search?: string;
  cursor?: string;
}

/** Staff outbox: every SMS an admin sent, newest first, keyset pagination. */
export async function listOutbox(filter: OutboxFilter) {
  const search = filter.search?.trim();
  const rows = await prisma.smsMessage.findMany({
    where: {
      ...(filter.status ? { status: filter.status } : {}),
      ...(search
        ? {
            OR: [
              { body: { contains: search, mode: "insensitive" } },
              { phone: { contains: search } },
              { recipient: { email: { contains: search, mode: "insensitive" } } },
              { recipient: { fullName: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: PAGE_SIZE + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    select: OUTBOX_SELECT,
  });
  const hasMore = rows.length > PAGE_SIZE;
  const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

export function listDrafts(authorId: string) {
  return prisma.smsDraft.findMany({
    where: { authorId },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: {
      id: true,
      audience: true,
      body: true,
      updatedAt: true,
      recipientUserId: true,
    },
  });
}

/** One draft, only if it is the author's; includes the recipient's email so the form can be filled in. */
export async function getDraft(authorId: string, draftId: string) {
  const draft = await prisma.smsDraft.findFirst({
    where: { id: draftId, authorId },
    select: { id: true, audience: true, body: true, recipientUserId: true },
  });
  if (!draft) return null;
  const recipient = draft.recipientUserId
    ? await prisma.user.findUnique({
        where: { id: draft.recipientUserId },
        select: { email: true },
      })
    : null;
  return { ...draft, recipientEmail: recipient?.email ?? "" };
}

/** What a member sees: only SMS that were actually handed off, newest first. */
export function listInbox(userId: string) {
  return prisma.smsMessage.findMany({
    where: { recipientUserId: userId, status: "SENT" },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: 100,
    select: { id: true, body: true, createdAt: true, readAt: true },
  });
}

export function countUnreadInbox(userId: string) {
  return prisma.smsMessage.count({
    where: { recipientUserId: userId, status: "SENT", readAt: null },
  });
}
