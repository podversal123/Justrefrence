"use client";

import { useT } from "@/i18n/provider";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { LifeBuoy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { ActionFormDialog } from "@/components/ui/action-form";
import { NativeSelect } from "@/components/ui/native-select";
import { createTicketAction } from "@/server/services/support-actions";
import { TICKET_CATEGORIES } from "@/lib/schemas/support";

export function NewTicketDialog() {
  const t = useT();
  const router = useRouter();
  return (
    <ActionFormDialog
      trigger={
        <Button>
          <LifeBuoy />
          {t("New ticket")}
        </Button>
      }
      title={t("Open a support ticket")}
      description={t(
        "Tell us what's wrong and we'll reply here. You'll get a notification when we do.",
      )}
      action={createTicketAction}
      submitLabel={t("Open ticket")}
      pendingLabel={t("Opening…")}
      successMessage={t("Ticket opened")}
      onSuccess={(data) => router.push(`/support/${data.ticketId}` as Route)}
    >
      {(errors) => (
        <>
          <FormField htmlFor="ticket-subject" label={t("Subject")} error={errors["subject"]}>
            <Input id="ticket-subject" name="subject" maxLength={120} required />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField htmlFor="ticket-category" label={t("Topic")} error={errors["category"]}>
              <NativeSelect id="ticket-category" name="category" defaultValue="Other">
                {TICKET_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField htmlFor="ticket-priority" label={t("Priority")} error={errors["priority"]}>
              <NativeSelect id="ticket-priority" name="priority" defaultValue="NORMAL">
                <option value="LOW">{t("Low")}</option>
                <option value="NORMAL">{t("Normal")}</option>
                <option value="HIGH">{t("High")}</option>
              </NativeSelect>
            </FormField>
          </div>
          <FormField htmlFor="ticket-message" label={t("What happened?")} error={errors["message"]}>
            <Textarea id="ticket-message" name="message" rows={5} maxLength={4000} required />
          </FormField>
        </>
      )}
    </ActionFormDialog>
  );
}
