"use client";

import { useT } from "@/i18n/provider";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { ActionForm } from "@/components/ui/action-form";
import { NativeSelect } from "@/components/ui/native-select";
import { toast } from "@/components/ui/toast";
import { grantRewardAction } from "@/server/services/reward-actions";

export function PayRewardForm({ userId, memberLabel }: { userId: string; memberLabel: string }) {
  const t = useT();
  const router = useRouter();
  const [discountType, setDiscountType] = useState<"PERCENT" | "FIXED">("PERCENT");
  // A fresh key per form, replaced after each success, so a double click can't pay twice.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  // Today in IST, the zone everyone on the platform sees.
  const [today] = useState(() => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10));

  return (
    <div className="space-y-4 rounded-lg border p-5">
      <div>
        <h2 className="text-base font-semibold">
          {t("Pay a reward to {member}", { member: memberLabel })}
        </h2>
        <p className="text-muted-foreground text-sm">
          {t("The coupon can be used only by this member, once, at checkout.")}
        </p>
      </div>

      <ActionForm
        action={grantRewardAction}
        submitLabel={t("Pay reward")}
        pendingLabel={t("Paying…")}
        successMessage={t("Reward paid")}
        onSuccess={(data) => {
          if (data.couponCode) toast.info(t("Coupon created"), `Code ${data.couponCode}`);
          setIdempotencyKey(crypto.randomUUID());
          router.refresh();
        }}
      >
        {(errors) => (
          <div className="space-y-4">
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

            <div>
              <FormField
                htmlFor="rw-title"
                label={t("Reward name")}
                hint={t("The member sees this.")}
                error={errors["title"]}
              >
                <Input
                  id="rw-title"
                  name="title"
                  maxLength={100}
                  placeholder={t("e.g. Diwali bonus")}
                  required
                />
              </FormField>
            </div>

            <fieldset className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
              <legend className="px-1 text-sm font-medium">{t("Coupon details")}</legend>
              <FormField
                htmlFor="rw-dtype"
                label={t("Discount type")}
                error={errors["discountType"]}
              >
                <NativeSelect
                  id="rw-dtype"
                  name="discountType"
                  value={discountType}
                  onChange={(event) => setDiscountType(event.target.value as "PERCENT" | "FIXED")}
                >
                  <option value="PERCENT">{t("Percentage off")}</option>
                  <option value="FIXED">{t("Fixed amount off")}</option>
                </NativeSelect>
              </FormField>
              {discountType === "PERCENT" ? (
                <FormField htmlFor="rw-percent" label={t("Percent off")} error={errors["percent"]}>
                  <Input id="rw-percent" name="percent" inputMode="decimal" placeholder="10" />
                </FormField>
              ) : (
                <FormField
                  htmlFor="rw-fixed"
                  label={t("Amount off (₹)")}
                  error={errors["fixedRupees"]}
                >
                  <Input id="rw-fixed" name="fixedRupees" inputMode="decimal" placeholder="200" />
                </FormField>
              )}
              <FormField
                htmlFor="rw-min"
                label={t("Minimum order (₹), optional")}
                error={errors["minOrderRupees"]}
              >
                <Input id="rw-min" name="minOrderRupees" inputMode="decimal" />
              </FormField>
              <FormField
                htmlFor="rw-expiry"
                label={t("Last day to use")}
                error={errors["expiresOn"]}
              >
                <Input id="rw-expiry" name="expiresOn" type="date" min={today} required />
              </FormField>
            </fieldset>

            <FormField
              htmlFor="rw-reason"
              label={t("Why is this being paid?")}
              hint={t("The member sees this, and it is kept in the record.")}
              error={errors["reason"]}
            >
              <Textarea id="rw-reason" name="reason" rows={2} maxLength={300} required />
            </FormField>
          </div>
        )}
      </ActionForm>
    </div>
  );
}
