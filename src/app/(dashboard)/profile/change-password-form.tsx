"use client";

import { useT } from "@/i18n/provider";
import { useActionState } from "@/lib/use-action-state";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { changePasswordAction } from "@/server/services/admin-actions";
import { FULL_ROW, FormGrid } from "@/components/ui/form-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ApiResult } from "@/lib/api-response";

const initialState: ApiResult<null> = { success: true, data: null, meta: { requestId: "" } };

function SubmitButton() {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? t("Updating…") : t("Change password")}
    </Button>
  );
}

export function ChangePasswordForm() {
  const t = useT();
  const [state, formAction] = useActionState(changePasswordAction, initialState);
  const submitted = state !== initialState;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {submitted && !state.success ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{t(state.error.message)}</AlertDescription>
        </Alert>
      ) : null}
      {submitted && state.success ? (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertDescription>{t("Password changed.")}</AlertDescription>
        </Alert>
      ) : null}

      <FormGrid>
        <div className={`space-y-2 ${FULL_ROW}`}>
          <Label htmlFor="currentPassword">{t("Current password")}</Label>
          <Input
            id="currentPassword"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="newPassword">{t("New password")}</Label>
          <Input
            id="newPassword"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            required
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="confirmNewPassword">{t("Confirm new password")}</Label>
          <Input
            id="confirmNewPassword"
            name="confirmNewPassword"
            type="password"
            autoComplete="new-password"
            required
          />
        </div>

        <p className={`text-muted-foreground text-xs ${FULL_ROW}`}>
          {t("At least 10 characters, with an uppercase letter, a lowercase letter, and a number.")}
        </p>
      </FormGrid>

      <SubmitButton />
    </form>
  );
}
