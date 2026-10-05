"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import {
  confirmRegistrationAction,
  resendRegistrationOtpAction,
} from "@/server/services/member-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ApiResult } from "@/lib/api-response";

const initialConfirmState: ApiResult<null> = { success: true, data: null, meta: { requestId: "" } };
const initialResendState: ApiResult<{ maskedDestination: string }> = {
  success: true,
  data: { maskedDestination: "" },
  meta: { requestId: "" },
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Verifying…" : "Verify and continue"}
    </Button>
  );
}

function ResendButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="link" size="sm" className="px-0" disabled={pending}>
      {pending ? "Sending…" : "Resend code"}
    </Button>
  );
}

export function VerifyForm({
  userId,
  channel,
  referralCode,
}: {
  userId: string;
  channel: string;
  referralCode?: string;
}) {
  const [state, formAction] = useActionState(confirmRegistrationAction, initialConfirmState);
  const [resendState, resendAction] = useActionState(resendRegistrationOtpAction, initialResendState);

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4" noValidate>
        <input type="hidden" name="userId" value={userId} />
        {referralCode ? <input type="hidden" name="referralCode" value={referralCode} /> : null}

        {!state.success ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertDescription>{state.error.message}</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="code">6-digit code</Label>
          <Input
            id="code"
            name="code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            required
            placeholder="123456"
          />
        </div>

        <SubmitButton />
      </form>

      <form action={resendAction} className="flex items-center justify-between">
        <input type="hidden" name="userId" value={userId} />
        <input type="hidden" name="channel" value={channel} />
        {resendState.success && resendState.data.maskedDestination ? (
          <span className="text-muted-foreground flex items-center gap-1 text-xs">
            <CheckCircle2 className="size-3.5" />
            Sent to {resendState.data.maskedDestination}
          </span>
        ) : !resendState.success ? (
          <span className="text-destructive text-xs">{resendState.error.message}</span>
        ) : (
          <span />
        )}
        <ResendButton />
      </form>
    </div>
  );
}
