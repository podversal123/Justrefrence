"use client";

import { msg } from "@/i18n/locales";
import { useT } from "@/i18n/provider";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { ActionForm } from "@/components/ui/action-form";
import { NativeSelect } from "@/components/ui/native-select";
import { submitFeedbackAction } from "@/server/services/content-actions";

export function FeedbackForm({
  defaultName,
  defaultEmail,
  messageLabel = msg("Your feedback"),
  submitLabel = msg("Send feedback"),
  successMessage = msg("Thank you. Your feedback was sent"),
  showRating = true,
}: {
  defaultName: string;
  defaultEmail: string;
  messageLabel?: string;
  submitLabel?: string;
  successMessage?: string;
  showRating?: boolean;
}) {
  const t = useT();
  return (
    <ActionForm
      action={submitFeedbackAction}
      submitLabel={submitLabel}
      pendingLabel={t("Sending…")}
      successMessage={successMessage}
    >
      {(errors) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField htmlFor="fb-name" label={t("Your name")} error={errors["name"]}>
              <Input id="fb-name" name="name" defaultValue={defaultName} maxLength={100} required />
            </FormField>
            <FormField htmlFor="fb-email" label={t("Email")} error={errors["email"]}>
              <Input
                id="fb-email"
                name="email"
                type="email"
                defaultValue={defaultEmail}
                autoComplete="email"
                required
              />
            </FormField>
          </div>
          {showRating ? (
            <FormField
              htmlFor="fb-rating"
              label={t("How would you rate us?")}
              error={errors["rating"]}
            >
              <NativeSelect id="fb-rating" name="rating" defaultValue="">
                <option value="">{t("Skip rating")}</option>
                <option value="5">{t("5: Excellent")}</option>
                <option value="4">{t("4: Good")}</option>
                <option value="3">{t("3: Okay")}</option>
                <option value="2">{t("2: Poor")}</option>
                <option value="1">{t("1: Very poor")}</option>
              </NativeSelect>
            </FormField>
          ) : null}
          <FormField htmlFor="fb-message" label={t(messageLabel)} error={errors["message"]}>
            <Textarea id="fb-message" name="message" rows={6} maxLength={3000} required />
          </FormField>
        </>
      )}
    </ActionForm>
  );
}
