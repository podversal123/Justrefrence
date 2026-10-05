"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { ActionForm } from "@/components/ui/action-form";
import { NativeSelect } from "@/components/ui/native-select";
import { createRequirementAction } from "@/server/services/bidding-actions";

/** `datetime-local` value for IST "now + minutes" — the platform shows and reads every time as IST. */
function istLocal(minutesFromNow: number): string {
  const ist = new Date(Date.now() + minutesFromNow * 60_000 + 5.5 * 3_600_000);
  return ist.toISOString().slice(0, 16);
}

export function RequirementForm() {
  const router = useRouter();
  const [type, setType] = useState<"TENDER" | "REVERSE_AUCTION">("TENDER");
  const auction = type === "REVERSE_AUCTION";

  return (
    <ActionForm
      action={createRequirementAction}
      submitLabel="Post requirement"
      pendingLabel="Posting…"
      successMessage="Requirement posted"
      onSuccess={(data) => router.push(`/requirements/${data.requirementId}` as Route)}
    >
      {(errors) => (
        <div className="space-y-5">
          <FormField htmlFor="rq-type" label="How should vendors bid?" error={errors["type"]}>
            <NativeSelect
              id="rq-type"
              name="type"
              value={type}
              onChange={(event) => setType(event.target.value as "TENDER" | "REVERSE_AUCTION")}
            >
              <option value="TENDER">Sealed tender: each vendor submits one private offer</option>
              <option value="REVERSE_AUCTION">
                Reverse auction: live bidding, lowest price wins
              </option>
            </NativeSelect>
          </FormField>

          <FormField htmlFor="rq-title" label="What do you need?" error={errors["title"]}>
            <Input
              id="rq-title"
              name="title"
              maxLength={150}
              placeholder="e.g. 50 ergonomic office chairs"
              required
            />
          </FormField>
          <FormField
            htmlFor="rq-desc"
            label="Details and specifications"
            hint="Sizes, standards, brands, warranty, anything a vendor needs to quote accurately."
            error={errors["description"]}
          >
            <Textarea id="rq-desc" name="description" rows={5} maxLength={4000} required />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-3">
            <FormField htmlFor="rq-kind" label="Type" error={errors["itemKind"]}>
              <NativeSelect id="rq-kind" name="itemKind" defaultValue="PRODUCT">
                <option value="PRODUCT">Product</option>
                <option value="SERVICE">Service</option>
                <option value="PROJECT">Project</option>
              </NativeSelect>
            </FormField>
            <FormField htmlFor="rq-qty" label="Quantity" error={errors["quantity"]}>
              <Input id="rq-qty" name="quantity" type="number" min={1} defaultValue={1} required />
            </FormField>
            <FormField htmlFor="rq-unit" label="Unit" error={errors["unit"]}>
              <Input id="rq-unit" name="unit" maxLength={20} defaultValue="units" />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField htmlFor="rq-cat" label="Category (optional)" error={errors["categoryLabel"]}>
              <Input
                id="rq-cat"
                name="categoryLabel"
                maxLength={80}
                placeholder="e.g. Office Furniture"
              />
            </FormField>
            <FormField
              htmlFor="rq-city"
              label="Deliver to (optional)"
              error={errors["deliveryCity"]}
            >
              <Input id="rq-city" name="deliveryCity" maxLength={80} placeholder="e.g. New Delhi" />
            </FormField>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              htmlFor="rq-closes"
              label="Bidding closes (IST)"
              hint="At least 5 minutes from now."
              error={errors["closesAtLocal"]}
            >
              <Input
                id="rq-closes"
                name="closesAtLocal"
                type="datetime-local"
                defaultValue={istLocal(60 * 24)}
                required
              />
            </FormField>
            <FormField
              htmlFor="rq-budget"
              label="Maximum budget, total (₹) — optional"
              hint="Bids above this total are refused."
              error={errors["maxBudgetRupees"]}
            >
              <Input
                id="rq-budget"
                name="maxBudgetRupees"
                inputMode="decimal"
                placeholder="50000"
              />
            </FormField>
          </div>

          {auction ? (
            <fieldset className="bg-info/5 border-info/30 grid gap-4 rounded-lg border p-4 sm:grid-cols-2">
              <legend className="px-1 text-sm font-medium">Auction rules</legend>
              <FormField
                htmlFor="rq-dec"
                label="Minimum price drop per bid (₹ per unit)"
                hint="Leave empty to allow any lower price."
                error={errors["minDecrementRupees"]}
              >
                <Input id="rq-dec" name="minDecrementRupees" inputMode="decimal" placeholder="10" />
              </FormField>
              <FormField
                htmlFor="rq-ext"
                label="Extend if a bid arrives in the last (minutes)"
                hint="0 turns this off. Stops last-second bids from ending an auction early."
                error={errors["autoExtendMinutes"]}
              >
                <Input
                  id="rq-ext"
                  name="autoExtendMinutes"
                  type="number"
                  min={0}
                  max={30}
                  defaultValue={5}
                />
              </FormField>
            </fieldset>
          ) : null}
        </div>
      )}
    </ActionForm>
  );
}
