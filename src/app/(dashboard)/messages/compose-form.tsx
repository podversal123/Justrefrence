"use client";

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { ActionForm } from "@/components/ui/action-form";
import { NativeSelect } from "@/components/ui/native-select";
import { sendMessageAction } from "@/server/services/message-actions";

export interface Recipient {
  id: string;
  label: string;
}

/**
 * Members and vendors write to the Justreference team; staff pick a
 * recipient. The server enforces the same rule — this just hides the
 * recipient picker for people who can't use it.
 */
export function ComposeForm({
  recipients,
  defaultRecipientId,
}: {
  recipients: Recipient[] | null;
  defaultRecipientId?: string;
}) {
  return (
    <ActionForm
      action={sendMessageAction}
      submitLabel="Send message"
      pendingLabel="Sending…"
      successMessage="Message sent"
    >
      {(errors) => (
        <>
          {recipients ? (
            <FormField htmlFor="msg-to" label="To" error={errors["toUserId"]}>
              <NativeSelect
                id="msg-to"
                name="toUserId"
                defaultValue={defaultRecipientId ?? ""}
                required
              >
                <option value="" disabled>
                  Choose a member or vendor
                </option>
                {recipients.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
          ) : (
            <p className="text-muted-foreground text-sm">
              This message goes to the Justreference team.
            </p>
          )}
          <FormField htmlFor="msg-subject" label="Subject" error={errors["subject"]}>
            <Input id="msg-subject" name="subject" maxLength={140} required />
          </FormField>
          <FormField htmlFor="msg-body" label="Message" error={errors["body"]}>
            <Textarea id="msg-body" name="body" rows={5} maxLength={4000} required />
          </FormField>
        </>
      )}
    </ActionForm>
  );
}
