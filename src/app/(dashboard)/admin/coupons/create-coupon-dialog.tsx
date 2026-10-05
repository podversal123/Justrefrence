"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { ActionFormDialog } from "@/components/ui/action-form";
import { NativeSelect } from "@/components/ui/native-select";
import { createCouponAction } from "@/server/services/coupon-actions";

export function CreateCouponDialog() {
  const [type, setType] = useState<"PERCENT" | "FIXED">("PERCENT");
  const today = new Date().toISOString().slice(0, 10);

  return (
    <ActionFormDialog
      trigger={
        <Button>
          <Plus />
          New coupon
        </Button>
      }
      title="Create a coupon"
      description="Customers enter the code at checkout. The discount can never exceed the cart total."
      action={createCouponAction}
      submitLabel="Create coupon"
      pendingLabel="Creating…"
      successMessage="Coupon created"
    >
      {(errors) => (
        <>
          <div className="grid grid-cols-2 gap-4">
            <FormField htmlFor="cp-code" label="Code" error={errors["code"]}>
              <Input
                id="cp-code"
                name="code"
                placeholder="WELCOME10"
                maxLength={24}
                className="uppercase"
                required
              />
            </FormField>
            <FormField htmlFor="cp-type" label="Discount type" error={errors["discountType"]}>
              <NativeSelect
                id="cp-type"
                name="discountType"
                value={type}
                onChange={(e) => setType(e.target.value as "PERCENT" | "FIXED")}
              >
                <option value="PERCENT">Percentage</option>
                <option value="FIXED">Fixed amount</option>
              </NativeSelect>
            </FormField>
          </div>

          {type === "PERCENT" ? (
            <FormField
              htmlFor="cp-percent"
              label="Percent off"
              hint="e.g. 10 or 7.5"
              error={errors["percent"]}
            >
              <Input id="cp-percent" name="percent" inputMode="decimal" placeholder="10" required />
            </FormField>
          ) : (
            <FormField
              htmlFor="cp-fixed"
              label="Amount off (₹)"
              hint="e.g. 200 or 199.50"
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
            label="Minimum order (₹)"
            hint="Leave empty for no minimum."
            error={errors["minOrderRupees"]}
          >
            <Input id="cp-min" name="minOrderRupees" inputMode="decimal" placeholder="0" />
          </FormField>

          <div className="grid grid-cols-2 gap-4">
            <FormField htmlFor="cp-start" label="Starts on" error={errors["startsOn"]}>
              <Input id="cp-start" name="startsOn" type="date" defaultValue={today} required />
            </FormField>
            <FormField
              htmlFor="cp-end"
              label="Valid through"
              hint="Optional."
              error={errors["expiresOn"]}
            >
              <Input id="cp-end" name="expiresOn" type="date" />
            </FormField>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <FormField
              htmlFor="cp-limit"
              label="Total uses"
              hint="Empty = unlimited."
              error={errors["usageLimit"]}
            >
              <Input id="cp-limit" name="usageLimit" type="number" min={1} />
            </FormField>
            <FormField
              htmlFor="cp-per"
              label="Uses per member"
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
