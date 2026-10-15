"use client";

import { useT } from "@/i18n/provider";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { ActionForm } from "@/components/ui/action-form";
import { NativeSelect } from "@/components/ui/native-select";
import { toast } from "@/components/ui/toast";
import { composeSmsAction } from "@/server/services/sms-actions";
import { MAX_SMS_PARTS, SMS_AUDIENCE_LABEL, smsLength } from "@/server/domain/sms/rules";
import { SMS_AUDIENCES } from "@/lib/schemas/sms";

export interface ComposeInitial {
  draftId?: string;
  audience: (typeof SMS_AUDIENCES)[number];
  recipientEmail: string;
  body: string;
}

export function ComposeForm({ initial }: { initial?: ComposeInitial }) {
  const t = useT();
  const router = useRouter();
  const [audience, setAudience] = useState<ComposeInitial["audience"]>(
    initial?.audience ?? "SINGLE",
  );
  const [body, setBody] = useState(initial?.body ?? "");
  // A fresh key per form, replaced after each send, so a double click can't send twice.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  const length = smsLength(body);

  return (
    <ActionForm
      action={composeSmsAction}
      submitLabel={t("Send now")}
      pendingLabel={t("Working…")}
      successMessage={t("Done")}
      resetOnSuccess={false}
      footer={
        <Button type="submit" name="intent" value="draft" variant="outline">
          {t("Save as draft")}
        </Button>
      }
      onSuccess={(data) => {
        if (data.kind === "draft") {
          toast.success(t("Draft saved"));
          router.push("/admin/sms?tab=drafts" as Route);
          return;
        }
        const { summary } = data;
        const parts = [`${summary.sent} of ${summary.total} sent`];
        if (summary.failed > 0) parts.push(`${summary.failed} failed`);
        if (summary.skippedNoPhone > 0)
          parts.push(`${summary.skippedNoPhone} skipped (no mobile number)`);
        toast.info(
          summary.recordedOnly ? "Recorded, not delivered yet" : "SMS sent",
          summary.recordedOnly
            ? `${parts.join(", ")}. The SMS service is not connected, so nothing reached a phone.`
            : parts.join(", "),
        );
        setBody("");
        setIdempotencyKey(crypto.randomUUID());
        router.push("/admin/sms?tab=outbox" as Route);
      }}
    >
      {(errors) => (
        <div className="space-y-4">
          <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
          {initial?.draftId ? <input type="hidden" name="draftId" value={initial.draftId} /> : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField htmlFor="sms-audience" label={t("Send to")} error={errors["audience"]}>
              <NativeSelect
                id="sms-audience"
                name="audience"
                value={audience}
                onChange={(event) => setAudience(event.target.value as ComposeInitial["audience"])}
              >
                {SMS_AUDIENCES.map((a) => (
                  <option key={a} value={a}>
                    {t(SMS_AUDIENCE_LABEL[a])}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            {audience === "SINGLE" ? (
              <FormField
                htmlFor="sms-email"
                label={t("Member's email")}
                error={errors["recipientEmail"]}
              >
                <Input
                  id="sms-email"
                  name="recipientEmail"
                  type="email"
                  defaultValue={initial?.recipientEmail}
                  placeholder="member@example.com"
                  required
                />
              </FormField>
            ) : null}
          </div>

          <FormField
            htmlFor="sms-body"
            label={t("Message")}
            hint={`${length.parts === 1 ? t("{chars} characters · 1 SMS part", { chars: length.length }) : t("{chars} characters · {parts} SMS parts", { chars: length.length, parts: length.parts })}${length.unicode ? ` ${t("(Hindi or special characters make each part shorter)")}` : ""}. ${t("Up to {max} parts.", { max: MAX_SMS_PARTS })}`}
            error={errors["body"]}
          >
            <Textarea
              id="sms-body"
              name="body"
              rows={4}
              value={body}
              onChange={(event) => setBody(event.target.value)}
              required
            />
          </FormField>
        </div>
      )}
    </ActionForm>
  );
}
