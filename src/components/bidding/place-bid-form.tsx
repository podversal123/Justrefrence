"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { ActionForm } from "@/components/ui/action-form";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { toast } from "@/components/ui/toast";
import { formatPaise, paiseToRupeesInput } from "@/lib/money";
import { rupeesToPaise } from "@/lib/money-input";
import { placeBidAction, withdrawBidAction } from "@/server/services/bidding-actions";

export interface ExistingBidData {
  unitPrice: string;
  deliveryDays: number;
  note: string | null;
}

/**
 * Place or revise a bid. The total shown is a convenience preview computed
 * with the same exact paise arithmetic the server uses; the server recomputes
 * it and enforces every rule (open, decrement, budget) regardless.
 */
export function PlaceBidForm({
  requirementId,
  quantity,
  unit,
  type,
  minDecrement,
  maxBudget,
  existing,
}: {
  requirementId: string;
  quantity: number;
  unit: string;
  type: "TENDER" | "REVERSE_AUCTION";
  minDecrement: string;
  maxBudget: string | null;
  existing: ExistingBidData | null;
}) {
  const router = useRouter();
  const [price, setPrice] = useState(existing ? paiseToRupeesInput(existing.unitPrice) : "");
  const paise = rupeesToPaise(price);
  const total = paise !== null ? paise * BigInt(quantity) : null;
  const auction = type === "REVERSE_AUCTION";
  const decrement = BigInt(minDecrement);
  const ceiling = existing && auction ? BigInt(existing.unitPrice) - decrement : null;

  return (
    <div className="space-y-4 rounded-lg border p-5">
      <div>
        <h2 className="text-base font-semibold">
          {existing ? "Revise your bid" : "Place your bid"}
        </h2>
        <p className="text-muted-foreground text-sm">
          {auction
            ? "Reverse auction: the lowest total wins, and each new bid must be lower than your last."
            : "Sealed tender: only you and the buyer see your offer until bidding closes."}
        </p>
      </div>

      <ActionForm
        action={placeBidAction}
        submitLabel={existing ? "Update bid" : "Place bid"}
        pendingLabel="Submitting…"
        successMessage="Bid saved"
        resetOnSuccess={false}
        onSuccess={(data) => {
          if (auction) {
            toast.info(
              data.rank === 1 ? "You're the lowest bidder (L1)" : `You're currently L${data.rank}`,
              data.extended
                ? "Bidding was extended because your bid came in at the last minute."
                : undefined,
            );
          }
          router.refresh();
        }}
      >
        {(errors) => (
          <>
            <input type="hidden" name="requirementId" value={requirementId} />
            <FormField
              htmlFor="bid-price"
              label={`Your price per ${unit.replace(/s$/, "")} (₹)`}
              hint={
                ceiling !== null && ceiling > 0n
                  ? `Must be ₹${paiseToRupeesInput(ceiling.toString())} or lower${decrement > 0n ? ` (minimum drop ₹${paiseToRupeesInput(decrement.toString())})` : ""}.`
                  : "Enter the price in rupees, e.g. 1500 or 1499.50."
              }
              error={errors["unitPriceRupees"]}
            >
              <Input
                id="bid-price"
                name="unitPriceRupees"
                inputMode="decimal"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                required
              />
            </FormField>

            <div className="bg-muted/50 flex items-baseline justify-between rounded-md px-3 py-2 text-sm">
              <span className="text-muted-foreground">
                Total for {quantity.toLocaleString("en-IN")} {unit}
              </span>
              <span className="text-base font-semibold tabular-nums">
                {total !== null ? formatPaise(total.toString(), "INR") : "—"}
              </span>
            </div>
            {maxBudget !== null && total !== null && total > BigInt(maxBudget) ? (
              <p className="text-destructive text-xs">
                This is above the buyer&apos;s maximum budget of {formatPaise(maxBudget, "INR")}.
              </p>
            ) : null}

            <FormField
              htmlFor="bid-days"
              label="Delivery time (days)"
              error={errors["deliveryDays"]}
            >
              <Input
                id="bid-days"
                name="deliveryDays"
                type="number"
                min={1}
                max={365}
                defaultValue={existing?.deliveryDays ?? 7}
                required
              />
            </FormField>
            <FormField
              htmlFor="bid-note"
              label="Note to the buyer (optional)"
              error={errors["note"]}
            >
              <Textarea
                id="bid-note"
                name="note"
                rows={3}
                maxLength={500}
                defaultValue={existing?.note ?? ""}
              />
            </FormField>
          </>
        )}
      </ActionForm>

      {existing && !auction ? (
        <ConfirmationDialog
          trigger={
            <Button type="button" variant="outline" size="sm">
              Withdraw bid
            </Button>
          }
          title="Withdraw your bid?"
          description="You can place a new bid any time before bidding closes."
          action={withdrawBidAction}
          hiddenFields={{ requirementId }}
          confirmLabel="Withdraw"
          variant="destructive"
          successMessage="Bid withdrawn"
        />
      ) : null}
    </div>
  );
}
