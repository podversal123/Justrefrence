"use client";

import { useT } from "@/i18n/provider";
import { useActionState } from "@/lib/use-action-state";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { updateProfileAction } from "@/server/services/admin-actions";
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
      {pending ? t("Saving…") : t("Save changes")}
    </Button>
  );
}

export function ProfileForm({
  email,
  fullName,
  mobile,
  mobileVerified,
}: {
  email: string;
  fullName: string | null;
  mobile: string | null;
  mobileVerified: boolean;
}) {
  const t = useT();
  const [state, formAction] = useActionState(updateProfileAction, initialState);
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
          <AlertDescription>{t("Profile updated.")}</AlertDescription>
        </Alert>
      ) : null}

      <FormGrid>
        <div className="space-y-2">
          <Label htmlFor="fullName">{t("Full name")}</Label>
          <Input id="fullName" name="fullName" defaultValue={fullName ?? ""} required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="email-display">{t("Email")}</Label>
          <Input id="email-display" value={email} disabled readOnly />
        </div>

        <div className={`space-y-2 ${FULL_ROW}`}>
          <Label htmlFor="mobile-display">{t("Mobile")}</Label>
          <Input
            id="mobile-display"
            value={mobile ?? "Not added"}
            disabled
            readOnly
            aria-describedby="mobile-help"
          />
          <p id="mobile-help" className="text-muted-foreground text-xs">
            {mobile
              ? mobileVerified
                ? t("Verified. To change your mobile number, contact support.")
                : t("Not verified yet. To change your mobile number, contact support.")
              : t("Add a mobile number by contacting support.")}
          </p>
        </div>
      </FormGrid>

      <SubmitButton />
    </form>
  );
}
