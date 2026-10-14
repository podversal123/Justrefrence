"use client";

import { useT } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ActionForm } from "@/components/ui/action-form";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { replyToTicketAction, updateTicketStatusAction } from "@/server/services/support-actions";

export function TicketReplyForm({ ticketId, staff }: { ticketId: string; staff: boolean }) {
  const t = useT();
  return (
    <ActionForm
      action={replyToTicketAction}
      submitLabel={t("Send reply")}
      pendingLabel={t("Sending…")}
      successMessage={t("Reply sent")}
    >
      {(errors) => (
        <>
          <input type="hidden" name="ticketId" value={ticketId} />
          <div className="space-y-2">
            <Label htmlFor="ticket-reply">
              {staff ? t("Reply to the member") : t("Add a reply")}
            </Label>
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
  const t = useT();
  if (status === "CLOSED") return null;
  return (
    <div className="flex flex-wrap gap-2">
      {staff && status !== "IN_PROGRESS" ? (
        <ConfirmationDialog
          trigger={<Button variant="outline">{t("Mark in progress")}</Button>}
          title={t("Mark this ticket in progress?")}
          action={updateTicketStatusAction}
          hiddenFields={{ ticketId, status: "IN_PROGRESS" }}
          confirmLabel={t("Mark in progress")}
          successMessage={t("Ticket marked in progress")}
        />
      ) : null}
      {staff && status !== "RESOLVED" ? (
        <ConfirmationDialog
          trigger={<Button variant="outline">{t("Mark resolved")}</Button>}
          title={t("Mark this ticket resolved?")}
          description={t("The member can still reply, which reopens it.")}
          action={updateTicketStatusAction}
          hiddenFields={{ ticketId, status: "RESOLVED" }}
          confirmLabel={t("Mark resolved")}
          successMessage={t("Ticket resolved")}
        />
      ) : null}
      {canClose ? (
        <ConfirmationDialog
          trigger={<Button variant="outline">{t("Close ticket")}</Button>}
          title={t("Close this ticket?")}
          description={t(
            "A closed ticket can't be replied to. Open a new ticket if the problem comes back.",
          )}
          action={updateTicketStatusAction}
          hiddenFields={{ ticketId, status: "CLOSED" }}
          confirmLabel={t("Close ticket")}
          successMessage={t("Ticket closed")}
        />
      ) : null}
    </div>
  );
}
