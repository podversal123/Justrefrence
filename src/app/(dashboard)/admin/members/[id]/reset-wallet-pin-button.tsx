"use client";

import { useT } from "@/i18n/provider";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { ActionFormDialog } from "@/components/ui/action-form";
import { resetMemberWalletPinAction } from "@/server/services/wallet-actions";

/** Clears a member's wallet PIN (forgotten PIN) with a recorded reason; the member sets a new one. */
export function ResetWalletPinButton({ userId }: { userId: string }) {
  const t = useT();
  return (
    <ActionFormDialog
      trigger={
        <Button variant="outline">
          <KeyRound />
          {t("Reset wallet PIN")}
        </Button>
      }
      title={t("Reset this member's wallet PIN?")}
      description={t(
        "The PIN is cleared, not shown to anyone. The member is told and sets a new PIN in their Wallet. Until then payouts need no PIN, so only do this once you are sure it is the member.",
      )}
      action={resetMemberWalletPinAction}
      submitLabel={t("Reset wallet PIN")}
      pendingLabel={t("Saving…")}
      successMessage={t("Wallet PIN reset")}
    >
      {(errors) => (
        <>
          <input type="hidden" name="userId" value={userId} />
          <FormField
            htmlFor="reset-pin-reason"
            label={t("Reason")}
            hint={t("Recorded in the audit log.")}
            error={errors["reason"]}
          >
            <Textarea id="reset-pin-reason" name="reason" rows={3} maxLength={300} required />
          </FormField>
        </>
      )}
    </ActionFormDialog>
  );
}
