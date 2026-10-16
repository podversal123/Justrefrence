"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useFormStatus } from "react-dom";
import { AlertCircle, Paperclip } from "lucide-react";
import { useT } from "@/i18n/provider";
import { useActionState } from "@/lib/use-action-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/upload-limits";
import { saveMessageDraftAction, sendMessageAction } from "@/server/services/message-actions";
import type { ApiResult } from "@/lib/api-response";
import type { FieldErrors } from "@/components/ui/action-form";

export interface Recipient {
  id: string;
  label: string;
}

export interface DraftValues {
  id: string;
  subject: string;
  body: string;
}

function fieldErrors(state: ApiResult<unknown> | null): FieldErrors {
  if (!state || state.success) return {};
  return (state.error.details as { fieldErrors?: FieldErrors } | undefined)?.fieldErrors ?? {};
}

/**
 * Members and vendors write to the Justreference team, with an optional document that only the team
 * can open, and can save a message as a draft to finish later. Staff pick a recipient. The server
 * enforces the same rules; this only hides what a person cannot use.
 */
export function ComposeForm({
  recipients,
  defaultRecipientId,
  draft,
}: {
  recipients: Recipient[] | null;
  defaultRecipientId?: string;
  draft?: DraftValues | null;
}) {
  const t = useT();
  const router = useRouter();
  const toTeam = recipients === null;
  const [sendState, sendAction] = useActionState(sendMessageAction, null);
  const [draftState, draftAction] = useActionState(saveMessageDraftAction, null);
  const handledSend = useRef<unknown>(null);
  const handledDraft = useRef<unknown>(null);

  useEffect(() => {
    if (!sendState?.success || handledSend.current === sendState) return;
    handledSend.current = sendState;
    toast.success(t("Message sent"));
    // A sent draft is gone, so leave the draft link behind.
    if (draft) router.replace("/messages?box=sent" as Route);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sendState]);

  useEffect(() => {
    if (!draftState?.success || handledDraft.current === draftState) return;
    handledDraft.current = draftState;
    toast.success(t("Draft saved"));
    router.replace(`/messages?draft=${draftState.data.draftId}` as Route);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftState]);

  const failure =
    sendState && !sendState.success
      ? sendState.error.message
      : draftState && !draftState.success
        ? draftState.error.message
        : null;
  const errors = { ...fieldErrors(draftState), ...fieldErrors(sendState) };

  function checkFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file && file.size > MAX_UPLOAD_BYTES) {
      event.target.setCustomValidity(
        t("This file is too large. Use one up to {size}.", { size: MAX_UPLOAD_LABEL }),
      );
      event.target.reportValidity();
      event.target.value = "";
    } else {
      event.target.setCustomValidity("");
    }
  }

  return (
    <form key={draft?.id ?? "new"} action={sendAction} className="space-y-4" noValidate={false}>
      {failure ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{t(failure)}</AlertDescription>
        </Alert>
      ) : null}
      {draft ? <input type="hidden" name="draftId" value={draft.id} /> : null}

      {recipients ? (
        <FormField htmlFor="msg-to" label={t("To")} error={errors["toUserId"]}>
          <NativeSelect
            id="msg-to"
            name="toUserId"
            defaultValue={defaultRecipientId ?? ""}
            required
          >
            <option value="" disabled>
              {t("Choose a member or vendor")}
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
          {t("This message goes to the Justreference team.")}
        </p>
      )}
      <FormField htmlFor="msg-subject" label={t("Subject")} error={errors["subject"]}>
        <Input
          id="msg-subject"
          name="subject"
          maxLength={140}
          defaultValue={draft?.subject}
          required
        />
      </FormField>
      <FormField htmlFor="msg-body" label={t("Message")} error={errors["body"]}>
        <Textarea
          id="msg-body"
          name="body"
          rows={5}
          maxLength={4000}
          defaultValue={draft?.body}
          required
        />
      </FormField>

      {toTeam ? (
        <FormField
          htmlFor="msg-document"
          label={t("Attach a document (optional)")}
          hint={t(
            "Only the Justreference team can open it. PDF, JPEG, PNG or WebP, up to {size}.",
            {
              size: MAX_UPLOAD_LABEL,
            },
          )}
        >
          <div className="flex items-center gap-2">
            <Paperclip className="text-muted-foreground size-4 shrink-0" aria-hidden="true" />
            <input
              id="msg-document"
              name="document"
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              onChange={checkFile}
              className="file:bg-secondary file:text-secondary-foreground w-full text-sm file:mr-3 file:rounded-md file:border-0 file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
          </div>
        </FormField>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <SendButton />
        {toTeam ? <DraftButton action={draftAction} /> : null}
      </div>
    </form>
  );
}

function SendButton() {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? t("Sending…") : t("Send message")}
    </Button>
  );
}

function DraftButton({ action }: { action: (formData: FormData) => void }) {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" disabled={pending} formAction={action} formNoValidate>
      {t("Save draft")}
    </Button>
  );
}
