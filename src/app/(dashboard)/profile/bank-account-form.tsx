"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, ShieldCheck } from "lucide-react";
import { upsertBankAccountAction } from "@/server/services/member-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ApiResult } from "@/lib/api-response";

const initialState: ApiResult<null> = { success: true, data: null, meta: { requestId: "" } };

interface BankAccountValue {
  accountHolderName: string;
  accountNoMasked: string;
  ifsc: string;
  verifiedAt: Date | null;
}

function SubmitButton({ hasExisting }: { hasExisting: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : hasExisting ? "Replace bank account" : "Add bank account"}
    </Button>
  );
}

export function BankAccountForm({ bankAccount }: { bankAccount: BankAccountValue | null }) {
  const [state, formAction] = useActionState(upsertBankAccountAction, initialState);
  const submitted = state !== initialState;

  return (
    <div className="space-y-4">
      {bankAccount ? (
        <div className="bg-muted/50 flex items-center justify-between rounded-lg border p-3 text-sm">
          <div>
            <p className="font-medium">{bankAccount.accountHolderName}</p>
            <p className="text-muted-foreground font-mono text-xs">
              {bankAccount.accountNoMasked} · {bankAccount.ifsc}
            </p>
          </div>
          {bankAccount.verifiedAt ? (
            <span className="text-muted-foreground flex items-center gap-1 text-xs">
              <ShieldCheck className="size-3.5" /> Verified
            </span>
          ) : (
            <span className="text-muted-foreground text-xs">Pending verification</span>
          )}
        </div>
      ) : null}

      <form action={formAction} className="space-y-4" noValidate>
        {submitted && !state.success ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertDescription>{state.error.message}</AlertDescription>
          </Alert>
        ) : null}
        {submitted && state.success ? (
          <Alert>
            <CheckCircle2 className="size-4" />
            <AlertDescription>Bank account saved. It will need to be re-verified.</AlertDescription>
          </Alert>
        ) : null}

        <div className="space-y-2">
          <Label htmlFor="accountHolderName">Account holder name</Label>
          <Input id="accountHolderName" name="accountHolderName" required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="accountNumber">Account number</Label>
          <Input id="accountNumber" name="accountNumber" inputMode="numeric" required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="ifsc">IFSC code</Label>
          <Input id="ifsc" name="ifsc" placeholder="HDFC0001234" required />
        </div>

        <div className="space-y-2">
          <Label htmlFor="branchAddress">Branch address</Label>
          <Input id="branchAddress" name="branchAddress" />
        </div>

        <SubmitButton hasExisting={bankAccount !== null} />
      </form>
    </div>
  );
}
