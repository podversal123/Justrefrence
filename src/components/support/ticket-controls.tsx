"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ActionForm } from "@/components/ui/action-form";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { replyToTicketAction, updateTicketStatusAction } from "@/server/services/support-actions";

export function TicketReplyForm({ ticketId, staff }: { ticketId: string; staff: boolean }) {
  return (
    <ActionForm
      action={replyToTicketAction}
      submitLabel="Send reply"
      pendingLabel="Sending…"
      successMessage="Reply sent"
    >
      {(errors) => (
        <>
          <input type="hidden" name="ticketId" value={ticketId} />
          <div className="space-y-2">
            <Label htmlFor="ticket-reply">{staff ? "Reply to the member" : "Add a reply"}</Label>
            <Textarea id="ticket-reply" name="body" rows={4} maxLength={4000} required />
            {errors["body"]?.[0] ? (
              <p className="text-destructive text-xs">{errors["body"][0]}</p>
            ) : null}
          </div>
        </>
      )}
    </ActionForm>
  );
}

/** Status buttons. Staff can move a ticket along; a member can only close their own. */
export function TicketStatusControls({
  ticketId,
  status,
  staff,
  canClose,
}: {
  ticketId: string;
  status: string;
  staff: boolean;
  canClose: boolean;
}) {
  if (status === "CLOSED") return null;
  return (
    <div className="flex flex-wrap gap-2">
      {staff && status !== "IN_PROGRESS" ? (
        <ConfirmationDialog
          trigger={<Button variant="outline">Mark in progress</Button>}
          title="Mark this ticket in progress?"
          action={updateTicketStatusAction}
          hiddenFields={{ ticketId, status: "IN_PROGRESS" }}
          confirmLabel="Mark in progress"
          successMessage="Ticket marked in progress"
        />
      ) : null}
      {staff && status !== "RESOLVED" ? (
        <ConfirmationDialog
          trigger={<Button variant="outline">Mark resolved</Button>}
          title="Mark this ticket resolved?"
          description="The member can still reply, which reopens it."
          action={updateTicketStatusAction}
          hiddenFields={{ ticketId, status: "RESOLVED" }}
          confirmLabel="Mark resolved"
          successMessage="Ticket resolved"
        />
      ) : null}
      {canClose ? (
        <ConfirmationDialog
          trigger={<Button variant="outline">Close ticket</Button>}
          title="Close this ticket?"
          description="A closed ticket can't be replied to. Open a new ticket if the problem comes back."
          action={updateTicketStatusAction}
          hiddenFields={{ ticketId, status: "CLOSED" }}
          confirmLabel="Close ticket"
          successMessage="Ticket closed"
        />
      ) : null}
    </div>
  );
}
