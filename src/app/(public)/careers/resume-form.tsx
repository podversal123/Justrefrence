"use client";

import { useT } from "@/i18n/provider";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { ActionForm } from "@/components/ui/action-form";
import { submitResumeAction } from "@/server/services/careers-actions";
import { RESUME_POSITIONS } from "@/lib/schemas/careers";

/** The public Careers form: details, the position, and one résumé file. */
export function ResumeForm() {
  const t = useT();
  return (
    <ActionForm
      action={submitResumeAction}
      submitLabel={t("Send my résumé")}
      pendingLabel={t("Sending…")}
      successMessage={t("Thank you. We have received your résumé.")}
      className="surface-card space-y-4 p-5 sm:p-6"
    >
      {(errors) => (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField htmlFor="rs-name" label={t("Full name")} error={errors["fullName"]}>
              <Input id="rs-name" name="fullName" autoComplete="name" maxLength={80} required />
            </FormField>
            <FormField htmlFor="rs-email" label={t("Email")} error={errors["email"]}>
              <Input id="rs-email" name="email" type="email" autoComplete="email" required />
            </FormField>
            <FormField
              htmlFor="rs-phone"
              label={t("Mobile number (optional)")}
              hint={t("With country code, for example +919876543210.")}
              error={errors["phone"]}
            >
              <Input id="rs-phone" name="phone" type="tel" autoComplete="tel" maxLength={16} />
            </FormField>
            <FormField htmlFor="rs-position" label={t("Position")} error={errors["position"]}>
              {/* A plain select: it submits with the form and works with the keyboard everywhere. */}
              <select
                id="rs-position"
                name="position"
                required
                defaultValue=""
                className="border-input bg-background focus-visible:ring-ring/50 h-8 w-full rounded-lg border px-2.5 text-sm outline-none focus-visible:ring-3"
              >
                <option value="" disabled>
                  {t("Choose a position")}
                </option>
                {RESUME_POSITIONS.map((position) => (
                  <option key={position} value={position}>
                    {position}
                  </option>
                ))}
              </select>
            </FormField>
          </div>

          <FormField
            htmlFor="rs-message"
            label={t("A short note (optional)")}
            error={errors["message"]}
          >
            <Textarea id="rs-message" name="message" rows={3} maxLength={1000} />
          </FormField>

          <FormField
            htmlFor="rs-file"
            label={t("Your résumé")}
            hint={t("PDF, DOC or DOCX, up to 4MB.")}
            error={errors["resume"]}
          >
            <Input
              id="rs-file"
              name="resume"
              type="file"
              accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
              required
            />
          </FormField>

          {/* A hidden field for bots: people never see or fill it. */}
          <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
            <label htmlFor="rs-website">Website</label>
            <input id="rs-website" name="website" tabIndex={-1} autoComplete="off" />
          </div>

          <p className="text-muted-foreground text-xs">
            {t("Only our hiring team can open your résumé.")}
          </p>
        </>
      )}
    </ActionForm>
  );
}
