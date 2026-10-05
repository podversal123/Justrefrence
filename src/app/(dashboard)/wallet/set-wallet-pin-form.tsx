"use client";

import { useActionState, useEffect } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle } from "lucide-react";
import { setWalletPinAction } from "@/server/services/wallet-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "@/components/ui/toast";
import type { ApiResult } from "@/lib/api-response";

const initialState: ApiResult<null> = { success: true, data: null, meta: { requestId: "" } };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="touch" disabled={pending}>
      {pending ? "Saving…" : "Set PIN"}
    </Button>
  );
}

/**
 * Optional wallet PIN — set once, then the payout-request form asks for it
 * on every submission (see PayoutRequestForm). `setWalletPinAction` already
 * revalidates "/wallet" on success, so after a successful submit the
 * server component re-renders with `wallet.walletPinHash` set and swaps
 * this form out for the "PIN is set" indicator — no client-side state
 * needed beyond the success toast.
 */
export function SetWalletPinForm() {
  const [state, formAction] = useActionState(setWalletPinAction, initialState);
  const submitted = state !== initialState;

  useEffect(() => {
    if (submitted && state.success) {
      toast.success("Wallet PIN set", "You'll be asked for it when requesting a payout.");
    }
  }, [state, submitted]);

  return (
    <form action={formAction} className="flex flex-col gap-4" noValidate>
      {submitted && !state.success ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{state.error.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="pin">6-digit PIN</Label>
          <Input id="pin" name="pin" type="password" inputMode="numeric" maxLength={6} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmPin">Confirm PIN</Label>
          <Input id="confirmPin" name="confirmPin" type="password" inputMode="numeric" maxLength={6} required />
        </div>
      </div>

      <div>
        <SubmitButton />
      </div>
    </form>
  );
}
