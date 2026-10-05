import "server-only";
import { prisma } from "@/server/lib/prisma";
import type { TicketPriority, TicketStatus } from "@/generated/prisma/enums";

const TICKET_LIST_SELECT = {
  id: true,
  ticketNo: true,
  subject: true,
  category: true,
  priority: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { fullName: true, email: true } },
} as const;

const LIST_LIMIT = 100;

export function formatTicketNo(ticketNo: number): string {
  return `TKT-${String(ticketNo).padStart(6, "0")}`;
}

/** The ticket and its opening message are created together or not at all. */
export async function createTicket(input: {
  userId: string;
  subject: string;
  category: string;
  priority: TicketPriority;
  message: string;
}) {
  return prisma.supportTicket.create({
    data: {
      userId: input.userId,
      subject: input.subject,
      category: input.category,
      priority: input.priority,
      messages: { create: { authorId: input.userId, body: input.message, isStaffReply: false } },
    },
    select: { id: true, ticketNo: true },
  });
}

export async function listTicketsForUser(userId: string) {
  return prisma.supportTicket.findMany({
    where: { userId },
    orderBy: { updatedAt: "desc" },
    take: LIST_LIMIT,
    select: TICKET_LIST_SELECT,
  });
}

export async function listAllTickets(filter: { status?: TicketStatus; search?: string }) {
  const search = filter.search?.trim();
  return prisma.supportTicket.findMany({
    where: {
      ...(filter.status ? { status: filter.status } : {}),
      ...(search
        ? {
            OR: [
              { subject: { contains: search, mode: "insensitive" } },
              { user: { email: { contains: search, mode: "insensitive" } } },
              { user: { fullName: { contains: search, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
    take: LIST_LIMIT,
    select: TICKET_LIST_SELECT,
  });
}

export async function getTicketWithMessages(id: string) {
  return prisma.supportTicket.findUnique({
    where: { id },
    select: {
      ...TICKET_LIST_SELECT,
      userId: true,
      closedAt: true,
      messages: {
        orderBy: { createdAt: "asc" },
        select: {
          id: true,
          body: true,
          isStaffReply: true,
          createdAt: true,
          author: { select: { fullName: true, email: true } },
        },
      },
    },
  });
}

export async function countTicketsByStatus() {
  const rows = await prisma.supportTicket.groupBy({ by: ["status"], _count: { _all: true } });
  return Object.fromEntries(rows.map((r) => [r.status, r._count._all])) as Partial<
    Record<TicketStatus, number>
  >;
}

/**
 * Appends a reply and moves the ticket's status in ONE transaction. The
 * status change is a conditional UPDATE so a ticket that was closed
 * concurrently is never silently reopened by a late reply: returns false
 * (and rolls the message back) in that case.
 */
export async function addReply(input: {
  ticketId: string;
  authorId: string;
  body: string;
  isStaffReply: boolean;
}): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const moved = input.isStaffReply
      ? await tx.supportTicket.updateMany({
          where: { id: input.ticketId, status: { in: ["OPEN", "IN_PROGRESS", "RESOLVED"] } },
          data: { status: "IN_PROGRESS" },
        })
      : // A member replying reopens a RESOLVED ticket; otherwise status is unchanged.
        await tx.supportTicket
          .updateMany({
            where: { id: input.ticketId, status: "RESOLVED" },
            data: { status: "OPEN" },
          })
          .then(async () =>
            tx.supportTicket.updateMany({
              where: { id: input.ticketId, status: { not: "CLOSED" } },
              data: { updatedAt: new Date() },
            }),
          );
    if (moved.count === 0) return false;

    if (input.isStaffReply) {
      await tx.supportTicket.updateMany({
        where: { id: input.ticketId, assignedTo: null },
        data: { assignedTo: input.authorId },
      });
    }
    await tx.ticketMessage.create({
      data: {
        ticketId: input.ticketId,
        authorId: input.authorId,
        body: input.body,
        isStaffReply: input.isStaffReply,
      },
    });
    return true;
  });
}

/** Conditional status change; `closedAt` follows CLOSED. Returns false if the ticket is already closed. */
export async function setTicketStatus(ticketId: string, status: TicketStatus): Promise<boolean> {
  const result = await prisma.supportTicket.updateMany({
    where: { id: ticketId, status: { not: "CLOSED" } },
    data: { status, closedAt: status === "CLOSED" ? new Date() : null },
  });
  return result.count > 0;
}
