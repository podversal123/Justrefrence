"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { ActionForm } from "@/components/ui/action-form";
import { NativeSelect } from "@/components/ui/native-select";
import { toast } from "@/components/ui/toast";
import { grantRewardAction } from "@/server/services/reward-actions";

type RewardKind = "CASH" | "COUPON" | "OTHER";

export function PayRewardForm({ userId, memberLabel }: { userId: string; memberLabel: string }) {
  const router = useRouter();
  const [type, setType] = useState<RewardKind>("CASH");
  const [discountType, setDiscountType] = useState<"PERCENT" | "FIXED">("PERCENT");
  // A fresh key per form, replaced after each success, so a double click can't pay twice.
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());
  // Today in IST, the zone everyone on the platform sees.
  const [today] = useState(() => new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10));

  return (
    <div className="space-y-4 rounded-lg border p-5">
      <div>
        <h2 className="text-base font-semibold">Pay a reward to {memberLabel}</h2>
        <p className="text-muted-foreground text-sm">
          Cash goes straight to their wallet. A coupon can be used only by this member. A gift is
          handed over by you, and you mark it as given.
        </p>
      </div>

      <ActionForm
        action={grantRewardAction}
        submitLabel="Pay reward"
        pendingLabel="Paying…"
        successMessage="Reward paid"
        onSuccess={(data) => {
          if (data.couponCode) toast.info("Coupon created", `Code ${data.couponCode}`);
          setIdempotencyKey(crypto.randomUUID());
          router.refresh();
        }}
      >
        {(errors) => (
          <div className="space-y-4">
            <input type="hidden" name="userId" value={userId} />
            <input type="hidden" name="idempotencyKey" value={idempotencyKey} />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField htmlFor="rw-type" label="Type of reward" error={errors["type"]}>
                <NativeSelect
                  id="rw-type"
                  name="type"
                  value={type}
                  onChange={(event) => setType(event.target.value as RewardKind)}
                >
                  <option value="CASH">Cash (added to wallet)</option>
                  <option value="COUPON">Coupon (only for this member)</option>
                  <option value="OTHER">Gift or benefit (handed over by you)</option>
                </NativeSelect>
              </FormField>
              <FormField
                htmlFor="rw-title"
                label="Reward name"
                hint="The member sees this."
                error={errors["title"]}
              >
                <Input
                  id="rw-title"
                  name="title"
                  maxLength={100}
                  placeholder="e.g. Diwali bonus"
                  required
                />
              </FormField>
            </div>

            {type === "CASH" ? (
              <FormField
                htmlFor="rw-amount"
                label="Amount (₹)"
                hint="Added to the member's wallet right away."
                error={errors["amountRupees"]}
              >
                <Input id="rw-amount" name="amountRupees" inputMode="decimal" required />
              </FormField>
            ) : null}

            {type === "COUPON" ? (
              <fieldset className="grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
                <legend className="px-1 text-sm font-medium">Coupon details</legend>
                <FormField htmlFor="rw-dtype" label="Discount type" error={errors["discountType"]}>
                  <NativeSelect
                    id="rw-dtype"
                    name="discountType"
                    value={discountType}
                    onChange={(event) => setDiscountType(event.target.value as "PERCENT" | "FIXED")}
                  >
                    <option value="PERCENT">Percentage off</option>
                    <option value="FIXED">Fixed amount off</option>
                  </NativeSelect>
                </FormField>
                {discountType === "PERCENT" ? (
                  <FormField htmlFor="rw-percent" label="Percent off" error={errors["percent"]}>
                    <Input id="rw-percent" name="percent" inputMode="decimal" placeholder="10" />
                  </FormField>
                ) : (
                  <FormField
                    htmlFor="rw-fixed"
                    label="Amount off (₹)"
                    error={errors["fixedRupees"]}
                  >
                    <Input id="rw-fixed" name="fixedRupees" inputMode="decimal" placeholder="200" />
                  </FormField>
                )}
                <FormField
                  htmlFor="rw-min"
                  label="Minimum order (₹), optional"
                  error={errors["minOrderRupees"]}
                >
                  <Input id="rw-min" name="minOrderRupees" inputMode="decimal" />
                </FormField>
                <FormField htmlFor="rw-expiry" label="Last day to use" error={errors["expiresOn"]}>
                  <Input id="rw-expiry" name="expiresOn" type="date" min={today} required />
                </FormField>
              </fieldset>
            ) : null}

            {type === "OTHER" ? (
              <FormField
                htmlFor="rw-gift-expiry"
                label="Last day to claim (optional)"
                error={errors["expiresOn"]}
              >
                <Input id="rw-gift-expiry" name="expiresOn" type="date" min={today} />
              </FormField>
            ) : null}

            <FormField
              htmlFor="rw-reason"
              label="Why is this being paid?"
              hint="The member sees this, and it is kept in the record."
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
