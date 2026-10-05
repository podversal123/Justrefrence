"use client";

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
  const router = useRouter();
  return (
    <ActionFormDialog
      trigger={
        <Button>
          <LifeBuoy />
          New ticket
        </Button>
      }
      title="Open a support ticket"
      description="Tell us what's wrong and we'll reply here. You'll get a notification when we do."
      action={createTicketAction}
      submitLabel="Open ticket"
      pendingLabel="Opening…"
      successMessage="Ticket opened"
      onSuccess={(data) => router.push(`/support/${data.ticketId}` as Route)}
    >
      {(errors) => (
        <>
          <FormField htmlFor="ticket-subject" label="Subject" error={errors["subject"]}>
            <Input id="ticket-subject" name="subject" maxLength={120} required />
          </FormField>
          <div className="grid grid-cols-2 gap-4">
            <FormField htmlFor="ticket-category" label="Topic" error={errors["category"]}>
              <NativeSelect id="ticket-category" name="category" defaultValue="Other">
                {TICKET_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField htmlFor="ticket-priority" label="Priority" error={errors["priority"]}>
              <NativeSelect id="ticket-priority" name="priority" defaultValue="NORMAL">
                <option value="LOW">Low</option>
                <option value="NORMAL">Normal</option>
                <option value="HIGH">High</option>
              </NativeSelect>
            </FormField>
          </div>
          <FormField htmlFor="ticket-message" label="What happened?" error={errors["message"]}>
            <Textarea id="ticket-message" name="message" rows={5} maxLength={4000} required />
          </FormField>
        </>
      )}
    </ActionFormDialog>
  );
}
