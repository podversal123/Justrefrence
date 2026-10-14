"use client";

import { useT } from "@/i18n/provider";
import { useEffect } from "react";
import { useActionState } from "@/lib/use-action-state";
import { useFormStatus } from "react-dom";
import { AlertCircle } from "lucide-react";
import { redeemEpinAction } from "@/server/services/epin-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { toast } from "@/components/ui/toast";
import type { ApiResult } from "@/lib/api-response";

const initialState: ApiResult<null> = { success: true, data: null, meta: { requestId: "" } };

function SubmitButton() {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="touch" disabled={pending}>
      {pending ? t("Activating…") : t("Redeem e-pin")}
    </Button>
  );
}

/**
 * Redeeming an e-pin is a one-way activation, but not money-moving — per
 * the brief, lean toward NOT adding a ConfirmationDialog here (unlike the
 * payout-request form on /wallet) and just submit directly with
 * disabled-while-pending plus a clear success toast.
 * `redeemEpinAction` creates the new Subscription server-side and calls
 * `revalidatePath("/subscription")` itself, so the page naturally shows
 * the new active subscription on next render.
 */
export function RedeemEpinForm() {
  const t = useT();
  const [state, formAction] = useActionState(redeemEpinAction, initialState);
  const submitted = state !== initialState;

  useEffect(() => {
    if (submitted && state.success) {
      toast.success(t("Subscription activated"), t("Your new subscription is now active."));
    }
    // `t` only changes when the language does; that must not announce the success a second time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, submitted]);

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {submitted && !state.success ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{t(state.error.message)}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="code">{t("E-pin code")}</Label>
        <Input id="code" name="code" placeholder={t("e.g. AB12CD34EF56GH78")} required />
      </div>

      <SubmitButton />
    </form>
  );
}
