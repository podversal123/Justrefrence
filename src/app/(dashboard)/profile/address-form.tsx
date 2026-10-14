"use client";

import { useT } from "@/i18n/provider";
import { useActionState } from "@/lib/use-action-state";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { upsertAddressAction } from "@/server/services/member-actions";
import { FULL_ROW, FormGrid } from "@/components/ui/form-grid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ApiResult } from "@/lib/api-response";

const initialState: ApiResult<null> = { success: true, data: null, meta: { requestId: "" } };

interface AddressValue {
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone: string | null;
}

function SubmitButton() {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? t("Saving…") : t("Save address")}
    </Button>
  );
}

export function AddressForm({
  type,
  address,
}: {
  type: "RESIDENCE" | "OFFICE" | "BILLING";
  address: AddressValue | null;
}) {
  const t = useT();
  const [state, formAction] = useActionState(upsertAddressAction, initialState);
  const submitted = state !== initialState;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="type" value={type} />

      {submitted && !state.success ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{t(state.error.message)}</AlertDescription>
        </Alert>
      ) : null}
      {submitted && state.success ? (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertDescription>{t("Address saved.")}</AlertDescription>
        </Alert>
      ) : null}

      <FormGrid>
        <div className={`space-y-2 ${FULL_ROW}`}>
          <Label htmlFor={`${type}-line1`}>{t("Address line 1")}</Label>
          <Input id={`${type}-line1`} name="line1" defaultValue={address?.line1 ?? ""} required />
        </div>

        <div className={`space-y-2 ${FULL_ROW}`}>
          <Label htmlFor={`${type}-line2`}>{t("Address line 2")}</Label>
          <Input id={`${type}-line2`} name="line2" defaultValue={address?.line2 ?? ""} />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${type}-city`}>{t("City")}</Label>
          <Input id={`${type}-city`} name="city" defaultValue={address?.city ?? ""} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${type}-state`}>{t("State")}</Label>
          <Input id={`${type}-state`} name="state" defaultValue={address?.state ?? ""} required />
        </div>

        <div className="space-y-2">
          <Label htmlFor={`${type}-postalCode`}>{t("PIN code")}</Label>
          <Input
            id={`${type}-postalCode`}
            name="postalCode"
            inputMode="numeric"
            defaultValue={address?.postalCode ?? ""}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${type}-country`}>{t("Country")}</Label>
          <Input
            id={`${type}-country`}
            name="country"
            defaultValue={address?.country ?? "IN"}
            maxLength={2}
            required
          />
        </div>

        <div className={`space-y-2 ${FULL_ROW}`}>
          <Label htmlFor={`${type}-phone`}>{t("Contact number (optional)")}</Label>
          <Input
            id={`${type}-phone`}
            name="phone"
            type="tel"
            defaultValue={address?.phone ?? ""}
            placeholder="+919876543210"
          />
          <p className="text-muted-foreground text-xs">
            {t("Who to call at this address, with country code.")}
          </p>
        </div>
      </FormGrid>

      <SubmitButton />
    </form>
  );
}
