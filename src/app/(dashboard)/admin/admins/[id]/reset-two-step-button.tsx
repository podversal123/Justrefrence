"use client";

import { useT } from "@/i18n/provider";
import { ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { ActionFormDialog } from "@/components/ui/action-form";
import { resetTwoStepAction } from "@/server/services/two-step-admin-actions";

/** Clears this account's two-step login (lost phone) with a recorded reason. */
export function ResetTwoStepButton({ userId }: { userId: string }) {
  const t = useT();
  return (
    <ActionFormDialog
      trigger={
        <Button variant="outline">
          <ShieldOff />
          {t("Reset two-step login")}
        </Button>
      }
      title={t("Reset this account's two-step login?")}
      description={t(
        "Their authenticator is removed. They can then sign in with their password and set up a new one. A session that is already signed in stays signed in, so if the account may be in the wrong hands, block it too. Only do this once you are sure it is them.",
      )}
      action={resetTwoStepAction}
      submitLabel={t("Reset two-step login")}
      pendingLabel={t("Saving…")}
      successMessage={t("Two-step login reset")}
    >
      {(errors) => (
        <>
          <input type="hidden" name="userId" value={userId} />
          <FormField
            htmlFor="reset-two-step-reason"
            label={t("Reason")}
            hint={t("Recorded in the audit log.")}
            error={errors["reason"]}
          >
            <Textarea id="reset-two-step-reason" name="reason" rows={3} maxLength={300} required />
          </FormField>
        </>
      )}
    </ActionFormDialog>
  );
}
