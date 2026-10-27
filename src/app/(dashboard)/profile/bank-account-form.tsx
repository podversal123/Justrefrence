"use client";

import { useT } from "@/i18n/provider";
import { useActionState } from "@/lib/use-action-state";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, ShieldCheck } from "lucide-react";
import {
  removeBankAccountAction,
  upsertBankAccountAction,
} from "@/server/services/member-actions";
import { FormGrid } from "@/components/ui/form-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ApiResult } from "@/lib/api-response";

const initialState: ApiResult<null> = { success: true, data: null, meta: { requestId: "" } };

interface BankAccountValue {
  id: string;
  accountHolderName: string;
  accountType: "SAVINGS" | "CURRENT";
  accountNoMasked: string;
  ifsc: string;
  verifiedAt: Date | null;
}

function SubmitButton() {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? t("Saving…") : t("Add bank account")}
    </Button>
  );
}

function RemoveButton({ bankAccountId }: { bankAccountId: string }) {
  const t = useT();
  const [, formAction] = useActionState(removeBankAccountAction, initialState);
  return (
    <form action={formAction}>
      <input type="hidden" name="bankAccountId" value={bankAccountId} />
      <Button type="submit" variant="ghost" size="sm">
        {t("Remove")}
      </Button>
    </form>
  );
}

/**
 * Saved accounts as a list, then a form to add another. A personal account (savings by default)
 * is held in the member's own name; a corporate account (current by default) in the company's,
 * so that name is prefilled from the account.
 */
export function BankAccountForm({
  bankAccounts,
  defaultHolderName,
  isCorporate,
}: {
  bankAccounts: BankAccountValue[];
  defaultHolderName: string;
  isCorporate: boolean;
}) {
  const t = useT();
  const [state, formAction] = useActionState(upsertBankAccountAction, initialState);
  const submitted = state !== initialState;

  return (
    <div className="space-y-4">
      {bankAccounts.length > 0 ? (
        <ul className="space-y-2">
          {bankAccounts.map((account) => (
            <li
              key={account.id}
              className="bg-muted/50 flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
            >
              <div>
                <p className="font-medium">{account.accountHolderName}</p>
                <p className="text-muted-foreground font-mono text-xs">
                  {account.accountNoMasked} · {account.ifsc}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-muted-foreground text-xs">
                  {account.accountType === "CURRENT" ? t("Current account") : t("Savings account")}
                </span>
                {account.verifiedAt ? (
                  <span className="text-muted-foreground flex items-center gap-1 text-xs">
                    <ShieldCheck className="size-3.5" />
                    {t("Verified")}
                  </span>
                ) : (
                  <span className="text-muted-foreground text-xs">{t("Pending verification")}</span>
                )}
                <RemoveButton bankAccountId={account.id} />
              </div>
            </li>
          ))}
        </ul>
      ) : null}

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
            <AlertDescription>
              {t("Bank account saved. It will need to be re-verified.")}
            </AlertDescription>
          </Alert>
        ) : null}

        <FormGrid>
          <div className="space-y-2">
            <Label htmlFor="accountType">{t("Account type")}</Label>
            <NativeSelect
              id="accountType"
              name="accountType"
              defaultValue={isCorporate ? "CURRENT" : "SAVINGS"}
              required
            >
              <option value="SAVINGS">{t("Savings account")}</option>
              <option value="CURRENT">{t("Current account")}</option>
            </NativeSelect>
          </div>

          <div className="space-y-2">
            <Label htmlFor="accountHolderName">
              {isCorporate ? t("Company name (account holder)") : t("Account holder name")}
            </Label>
            <Input
              id="accountHolderName"
              name="accountHolderName"
              defaultValue={defaultHolderName}
              required
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="accountNumber">{t("Account number")}</Label>
            <Input id="accountNumber" name="accountNumber" inputMode="numeric" required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="ifsc">{t("IFSC code")}</Label>
            <Input id="ifsc" name="ifsc" placeholder={t("HDFC0001234")} required />
          </div>

          <div className="space-y-2">
            <Label htmlFor="branchAddress">{t("Branch address")}</Label>
            <Input id="branchAddress" name="branchAddress" />
          </div>
        </FormGrid>

        <SubmitButton />
      </form>
    </div>
  );
}
