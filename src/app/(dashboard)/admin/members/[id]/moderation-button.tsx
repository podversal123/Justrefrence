"use client";

import { useT } from "@/i18n/provider";
import { Ban, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { ActionFormDialog } from "@/components/ui/action-form";
import { moderateMemberAction } from "@/server/services/member-moderation-actions";

/** Block (blacklist) or allow a member again — always with a recorded reason. */
export function ModerationButton({ userId, blocked }: { userId: string; blocked: boolean }) {
  const t = useT();
  return (
    <ActionFormDialog
      trigger={
        <Button variant={blocked ? "outline" : "destructive"}>
          {blocked ? <ShieldCheck /> : <Ban />}
          {blocked ? t("Allow member") : t("Block member")}
        </Button>
      }
      title={blocked ? t("Allow this member again?") : t("Block this member?")}
      description={
        blocked
          ? t("They will be able to sign in and use their account again.")
          : t(
              "They are signed out of every action immediately and can't use their account until you allow them again.",
            )
      }
      action={moderateMemberAction}
      submitLabel={blocked ? t("Allow member") : t("Block member")}
      pendingLabel={t("Saving…")}
      successMessage={blocked ? t("Member allowed") : t("Member blocked")}
    >
      {(errors) => (
        <>
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="action" value={blocked ? "UNBLOCK" : "BLOCK"} />
          <FormField
            htmlFor="moderation-reason"
            label={t("Reason")}
            hint={t("Recorded in the audit log.")}
            error={errors["reason"]}
          >
            <Textarea id="moderation-reason" name="reason" rows={3} maxLength={300} required />
          </FormField>
        </>
      )}
    </ActionFormDialog>
  );
}
