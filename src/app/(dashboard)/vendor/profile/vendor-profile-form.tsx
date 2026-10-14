"use client";

import { useT } from "@/i18n/provider";
import { useActionState } from "@/lib/use-action-state";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { updateVendorProfileAction } from "@/server/services/vendor-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ApiResult } from "@/lib/api-response";
import type { FieldErrors } from "@/components/ui/action-form";

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

export interface VendorProfileValues {
  businessName: string;
  phone: string | null;
  telephone: string | null;
  gstin: string | null;
  pan: string | null;
}

export function VendorProfileForm({ values }: { values: VendorProfileValues }) {
  const t = useT();
  const [state, formAction] = useActionState(updateVendorProfileAction, initialState);
  const submitted = state !== initialState;
  const errors: FieldErrors =
    submitted && !state.success
      ? ((state.error.details as { fieldErrors?: FieldErrors } | undefined)?.fieldErrors ?? {})
      : {};

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
          <AlertDescription>{t("Business profile saved.")}</AlertDescription>
        </Alert>
      ) : null}

      <FormField htmlFor="businessName" label={t("Business name")} error={errors["businessName"]}>
        <Input id="businessName" name="businessName" defaultValue={values.businessName} required />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          htmlFor="vp-phone"
          label={t("Business mobile")}
          hint={t("With country code. Buyers and our team reach you here.")}
          error={errors["phone"]}
        >
          <Input
            id="vp-phone"
            name="phone"
            type="tel"
            defaultValue={values.phone ?? ""}
            placeholder="+919876543210"
            required
          />
        </FormField>
        <FormField
          htmlFor="vp-telephone"
          label={t("Telephone (optional)")}
          error={errors["telephone"]}
        >
          <Input
            id="vp-telephone"
            name="telephone"
            type="tel"
            defaultValue={values.telephone ?? ""}
            placeholder="011-23456789"
          />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField htmlFor="vp-gstin" label={t("GSTIN (optional)")} error={errors["gstin"]}>
          <Input
            id="vp-gstin"
            name="gstin"
            defaultValue={values.gstin ?? ""}
            placeholder={t("29ABCDE1234F1Z5")}
          />
        </FormField>
        <FormField htmlFor="vp-pan" label={t("Business PAN (optional)")} error={errors["pan"]}>
          <Input
            id="vp-pan"
            name="pan"
            defaultValue={values.pan ?? ""}
            placeholder={t("ABCDE1234F")}
          />
        </FormField>
      </div>

      <SubmitButton />
    </form>
  );
}
