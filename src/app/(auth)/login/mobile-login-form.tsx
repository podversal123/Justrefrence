"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle } from "lucide-react";
import {
  confirmMobileLoginOtpAction,
  requestMobileLoginOtpAction,
} from "@/server/services/member-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ApiResult } from "@/lib/api-response";

const initialRequestState: ApiResult<{ message: string }> = {
  success: true,
  data: { message: "" },
  meta: { requestId: "" },
};
const initialVerifyState: ApiResult<null> = { success: true, data: null, meta: { requestId: "" } };

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? pendingLabel : label}
    </Button>
  );
}

export function MobileLoginForm() {
  const [phone, setPhone] = useState("");
  const [step, setStep] = useState<"phone" | "code">("phone");

  const [requestState, requestAction] = useActionState(
    async (prevState: ApiResult<{ message: string }>, formData: FormData) => {
      const result = await requestMobileLoginOtpAction(prevState, formData);
      if (result.success) setStep("code");
      return result;
    },
    initialRequestState,
  );
  const [verifyState, verifyAction] = useActionState(confirmMobileLoginOtpAction, initialVerifyState);

  if (step === "phone") {
    return (
      <form action={requestAction} className="space-y-4" noValidate>
        {!requestState.success ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertDescription>{requestState.error.message}</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="mobile-phone">Mobile number</Label>
          <Input
            id="mobile-phone"
            name="phone"
            type="tel"
            autoComplete="tel"
            required
            placeholder="+919876543210"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </div>

        <SubmitButton label="Send code" pendingLabel="Sending…" />
      </form>
    );
  }

  return (
    <form action={verifyAction} className="space-y-4" noValidate>
      <input type="hidden" name="phone" value={phone} />

      {!verifyState.success ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{verifyState.error.message}</AlertDescription>
        </Alert>
      ) : null}

      <p className="text-muted-foreground text-sm">
        If {phone} is registered, we sent it a 6-digit code.
      </p>

      <div className="space-y-2">
        <Label htmlFor="mobile-code">6-digit code</Label>
        <Input
          id="mobile-code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          required
          placeholder="123456"
        />
      </div>

      <SubmitButton label="Sign in" pendingLabel="Signing in…" />

      <Button type="button" variant="link" size="sm" className="px-0" onClick={() => setStep("phone")}>
        Use a different number
      </Button>
    </form>
  );
}
