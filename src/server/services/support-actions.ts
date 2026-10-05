"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/server/auth/authorize";
import { getAuthSession } from "@/server/auth/session";
import {
  addReply,
  createTicket,
  formatTicketNo,
  getTicketWithMessages,
  setTicketStatus,
} from "@/server/repositories/support/ticket-repository";
import { createNotification } from "@/server/repositories/identity/notification-repository";
import {
  createTicketSchema,
  replyTicketSchema,
  updateTicketStatusSchema,
} from "@/lib/schemas/support";
import { recordAudit } from "@/server/domain/audit/record";
import {
  AuthenticationError,
  AuthorizationError,
  ConflictError,
  NotFoundError,
  RateLimitedError,
} from "@/server/lib/errors";
import { contentRateLimiter } from "@/server/lib/rate-limit";
import { failureFrom, requestId, validationFailure } from "@/server/lib/action-helpers";
import type { ApiResult } from "@/lib/api-response";

/**
 * Support tickets. Permission and ownership are separate checks (docs/rbac.md):
 * `ticket:create` / `ticket:read` only ever reach the caller's OWN tickets;
 * `ticket:read:any` + `ticket:respond` / `ticket:close` are the staff powers.
 */

const TAG = "support_action_failed";

export async function createTicketAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<{ ticketId: string }>> {
  let session;
  try {
    session = await authorize("ticket:create");
  } catch (error) {
    return failureFrom(TAG, error, "You don't have permission to open a ticket.");
  }

  const limit = await contentRateLimiter.consume(`ticket:${session.userId}`);
  if (!limit.allowed) {
    return failureFrom(
      TAG,
      new RateLimitedError("You've sent a lot of messages recently. Please try again later."),
    );
  }

  const parsed = createTicketSchema.safeParse({
    subject: formData.get("subject"),
    category: formData.get("category") || undefined,
    priority: formData.get("priority") || undefined,
    message: formData.get("message"),
  });
  if (!parsed.success) return validationFailure("Check the ticket fields below.", parsed.error);

  try {
    const ticket = await createTicket({ userId: session.userId, ...parsed.data });
    await recordAudit({
      actorId: session.userId,
      action: "TICKET_CREATED",
      entityType: "support_tickets",
      entityId: ticket.id,
      after: {
        ticketNo: ticket.ticketNo,
        category: parsed.data.category,
        priority: parsed.data.priority,
      },
    });
    revalidatePath("/support");
    revalidatePath("/admin/support");
    return { success: true, data: { ticketId: ticket.id }, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom(TAG, error, "Could not open your ticket.");
  }
}

export async function replyToTicketAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  const session = await getAuthSession();
  if (!session) return failureFrom(TAG, new AuthenticationError("Please sign in again."));

  const parsed = replyTicketSchema.safeParse({
    ticketId: formData.get("ticketId"),
    body: formData.get("body"),
  });
  if (!parsed.success) return validationFailure("Write a reply first.", parsed.error);

  try {
    const ticket = await getTicketWithMessages(parsed.data.ticketId);
    if (!ticket) throw new NotFoundError("Ticket not found.");

    const isOwner = ticket.userId === session.userId;
    const isStaff = session.permissions.has("ticket:respond");
    // Ownership is checked separately from permission; a non-owner without
    // staff rights gets the same "not found" as a missing ticket (no probing).
    if (!isOwner && !isStaff) throw new NotFoundError("Ticket not found.");
    if (isOwner && !session.permissions.has("ticket:read"))
      throw new AuthorizationError("You can't reply to tickets.");
    if (ticket.status === "CLOSED")
      throw new ConflictError("This ticket is closed. Open a new ticket to continue.");

    const limit = await contentRateLimiter.consume(`ticket:${session.userId}`);
    if (!limit.allowed)
      throw new RateLimitedError("You've sent a lot of messages recently. Please try again later.");

    const applied = await addReply({
      ticketId: ticket.id,
      authorId: session.userId,
      body: parsed.data.body,
      isStaffReply: !isOwner,
    });
    if (!applied)
      throw new ConflictError("This ticket was just closed. Open a new ticket to continue.");

    if (!isOwner) {
      await createNotification({
        userId: ticket.userId,
        type: "TICKET_REPLY",
        payload: { ticketId: ticket.id, ticketNo: ticket.ticketNo },
      });
    }
    await recordAudit({
      actorId: session.userId,
      action: isOwner ? "TICKET_MEMBER_REPLY" : "TICKET_STAFF_REPLY",
      entityType: "support_tickets",
      entityId: ticket.id,
    });
    revalidatePath(`/support/${ticket.id}`);
    revalidatePath(`/admin/support/${ticket.id}`);
    return { success: true, data: null, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom(TAG, error, "Could not send your reply.");
  }
}

export async function updateTicketStatusAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  const parsed = updateTicketStatusSchema.safeParse({
    ticketId: formData.get("ticketId"),
    status: formData.get("status"),
  });
  if (!parsed.success) return validationFailure("Invalid status change.", parsed.error);

  const session = await getAuthSession();
  if (!session) return failureFrom(TAG, new AuthenticationError("Please sign in again."));

  try {
    const ticket = await getTicketWithMessages(parsed.data.ticketId);
    if (!ticket) throw new NotFoundError("Ticket not found.");

    const isOwner = ticket.userId === session.userId;
    const { status } = parsed.data;
    // Staff: IN_PROGRESS/RESOLVED need ticket:respond, CLOSED needs ticket:close.
    // A member may only close their own ticket.
    const staffAllowed = session.permissions.has(
      status === "CLOSED" ? "ticket:close" : "ticket:respond",
    );
    const ownerAllowed = isOwner && status === "CLOSED";
    if (!staffAllowed && !ownerAllowed) {
      if (!isOwner && !session.permissions.has("ticket:read:any"))
        throw new NotFoundError("Ticket not found.");
      throw new AuthorizationError("You don't have permission to change this ticket.");
    }

    const changed = await setTicketStatus(ticket.id, status);
    if (!changed) throw new ConflictError("This ticket is already closed.");

    await createNotification({
      userId: ticket.userId,
      type: "TICKET_STATUS",
      payload: { ticketId: ticket.id, ticketNo: ticket.ticketNo, status },
    }).catch(() => undefined);
    await recordAudit({
      actorId: session.userId,
      action: `TICKET_${status}`,
      entityType: "support_tickets",
      entityId: ticket.id,
      before: { status: ticket.status },
      after: { status, ticketNo: formatTicketNo(ticket.ticketNo) },
    });
    revalidatePath(`/support/${ticket.id}`);
    revalidatePath(`/admin/support/${ticket.id}`);
    revalidatePath("/admin/support");
    return { success: true, data: null, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom(TAG, error, "Could not update the ticket.");
  }
}
