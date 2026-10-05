"use client";

import { Ban, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { ActionFormDialog } from "@/components/ui/action-form";
import { moderateMemberAction } from "@/server/services/member-moderation-actions";

/** Block (blacklist) or allow a member again — always with a recorded reason. */
export function ModerationButton({ userId, blocked }: { userId: string; blocked: boolean }) {
  return (
    <ActionFormDialog
      trigger={
        <Button variant={blocked ? "outline" : "destructive"}>
          {blocked ? <ShieldCheck /> : <Ban />}
          {blocked ? "Allow member" : "Block member"}
        </Button>
      }
      title={blocked ? "Allow this member again?" : "Block this member?"}
      description={
        blocked
          ? "They will be able to sign in and use their account again."
          : "They are signed out of every action immediately and can't use their account until you allow them again."
      }
      action={moderateMemberAction}
      submitLabel={blocked ? "Allow member" : "Block member"}
      pendingLabel="Saving…"
      successMessage={blocked ? "Member allowed" : "Member blocked"}
    >
      {(errors) => (
        <>
          <input type="hidden" name="userId" value={userId} />
          <input type="hidden" name="action" value={blocked ? "UNBLOCK" : "BLOCK"} />
          <FormField
            htmlFor="moderation-reason"
            label="Reason"
            hint="Recorded in the audit log."
            error={errors["reason"]}
          >
            <Textarea id="moderation-reason" name="reason" rows={3} maxLength={300} required />
          </FormField>
        </>
      )}
    </ActionFormDialog>
  );
}
