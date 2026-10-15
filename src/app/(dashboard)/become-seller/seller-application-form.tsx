"use client";

import { useT } from "@/i18n/provider";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { ActionForm } from "@/components/ui/action-form";
import { requestSellerAccessAction } from "@/server/services/seller-actions";

export function SellerApplicationForm({
  values,
  resubmit = false,
}: {
  values?: { businessName: string; phone: string | null; gstin: string | null };
  /** True when sending a rejected request again. */
  resubmit?: boolean;
}) {
  const t = useT();
  return (
    <ActionForm
      action={requestSellerAccessAction}
      submitLabel={resubmit ? t("Send request again") : t("Send request")}
      pendingLabel={t("Sending…")}
      successMessage={t("Request sent")}
      resetOnSuccess={false}
    >
      {(errors) => (
        <div className="space-y-4">
          <FormField
            htmlFor="sa-business"
            label={t("Business or shop name")}
            error={errors["businessName"]}
          >
            <Input
              id="sa-business"
              name="businessName"
              defaultValue={values?.businessName ?? ""}
              maxLength={200}
              required
            />
          </FormField>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              htmlFor="sa-phone"
              label={t("Business mobile")}
              hint={t("With country code. Buyers and our team reach you here.")}
              error={errors["phone"]}
            >
              <Input
                id="sa-phone"
                name="phone"
                type="tel"
                defaultValue={values?.phone ?? ""}
                placeholder="+919876543210"
                required
              />
            </FormField>
            <FormField
              htmlFor="sa-gstin"
              label={t("GSTIN (optional)")}
              hint={t("You can add it later from your seller profile.")}
              error={errors["gstin"]}
            >
              <Input
                id="sa-gstin"
                name="gstin"
                defaultValue={values?.gstin ?? ""}
                placeholder={t("29ABCDE1234F1Z5")}
              />
            </FormField>
          </div>
        </div>
      )}
    </ActionForm>
  );
}
