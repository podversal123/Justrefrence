"use client";

import { useT } from "@/i18n/provider";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { ActionFormDialog } from "@/components/ui/action-form";
import { NativeSelect } from "@/components/ui/native-select";
import { createCouponAction } from "@/server/services/coupon-actions";

export function CreateCouponDialog() {
  const t = useT();
  const [type, setType] = useState<"PERCENT" | "FIXED">("PERCENT");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <ActionFormDialog
      trigger={
        <Button>
          <Plus />
          {t("New coupon")}
        </Button>
      }
      title={t("Create a coupon")}
      description={t(
        "Customers enter the code at checkout. The discount can never exceed the cart total.",
      )}
      action={createCouponAction}
      submitLabel={t("Create coupon")}
      pendingLabel={t("Creating…")}
      successMessage={t("Coupon created")}
    >
      {(errors) => (
        <>
          <div className="grid grid-cols-2 gap-4">
            <FormField htmlFor="cp-code" label={t("Code")} error={errors["code"]}>
              <Input
                id="cp-code"
                name="code"
                placeholder={t("WELCOME10")}
                maxLength={24}
                className="uppercase"
                required
              />
            </FormField>
            <FormField htmlFor="cp-type" label={t("Discount type")} error={errors["discountType"]}>
              <NativeSelect
                id="cp-type"
                name="discountType"
                value={type}
                onChange={(e) => setType(e.target.value as "PERCENT" | "FIXED")}
              >
                <option value="PERCENT">{t("Percentage")}</option>
                <option value="FIXED">{t("Fixed amount")}</option>
              </NativeSelect>
            </FormField>
          </div>

          {type === "PERCENT" ? (
            <FormField
              htmlFor="cp-percent"
              label={t("Percent off")}
              hint={t("e.g. 10 or 7.5")}
              error={errors["percent"]}
            >
              <Input id="cp-percent" name="percent" inputMode="decimal" placeholder="10" required />
            </FormField>
          ) : (
            <FormField
              htmlFor="cp-fixed"
              label={t("Amount off (₹)")}
              hint={t("e.g. 200 or 199.50")}
              error={errors["fixedRupees"]}
            >
              <Input
                id="cp-fixed"
                name="fixedRupees"
                inputMode="decimal"
                placeholder="200"
                required
              />
            </FormField>
          )}

          <FormField
            htmlFor="cp-min"
            label={t("Minimum order (₹)")}
            hint={t("Leave empty for no minimum.")}
            error={errors["minOrderRupees"]}
          >
            <Input id="cp-min" name="minOrderRupees" inputMode="decimal" placeholder="0" />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField htmlFor="cp-start" label={t("Starts on")} error={errors["startsOn"]}>
              <Input id="cp-start" name="startsOn" type="date" defaultValue={today} required />
            </FormField>
            <FormField
              htmlFor="cp-end"
              label={t("Valid through")}
              hint={t("Optional.")}
              error={errors["expiresOn"]}
            >
              <Input id="cp-end" name="expiresOn" type="date" />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              htmlFor="cp-limit"
              label={t("Total uses")}
              hint={t("Empty = unlimited.")}
              error={errors["usageLimit"]}
            >
              <Input id="cp-limit" name="usageLimit" type="number" min={1} />
            </FormField>
            <FormField
              htmlFor="cp-per"
              label={t("Uses per member")}
              error={errors["usageLimitPerMember"]}
            >
              <Input
                id="cp-per"
                name="usageLimitPerMember"
                type="number"
                min={1}
                defaultValue={1}
              />
            </FormField>
          </div>
        </>
      )}
    </ActionFormDialog>
  );
}
