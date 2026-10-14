"use client";

import { useT } from "@/i18n/provider";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { ActionForm, ActionFormDialog } from "@/components/ui/action-form";
import { cancelAuctionAction, claimAuctionAction } from "@/server/services/auction-actions";

/** The winner confirms the purchase; the order is created at the winning price and they go on to pay. */
export function PayForAuctionForm({ auctionId, total }: { auctionId: string; total: string }) {
  const t = useT();
  const router = useRouter();
  return (
    <ActionForm
      action={claimAuctionAction}
      submitLabel={`Pay ${total}`}
      pendingLabel={t("Placing your order…")}
      successMessage={t("Order placed")}
      onSuccess={(data) => router.push(`/checkout/pay?checkoutId=${data.checkoutId}` as Route)}
    >
      {() => <input type="hidden" name="auctionId" value={auctionId} />}
    </ActionForm>
  );
}

export function CancelAuctionButton({
  auctionId,
  hasWinner,
}: {
  auctionId: string;
  hasWinner: boolean;
}) {
  const t = useT();
  const router = useRouter();
  return (
    <ActionFormDialog
      trigger={
        <Button variant="outline" size="sm" type="button">
          {t("Cancel auction")}
        </Button>
      }
      title={t("Cancel this auction?")}
      description={
        hasWinner
          ? t("The winner has not paid yet. Cancelling tells them the sale is off.")
          : t("Bidding stops immediately.")
      }
      action={cancelAuctionAction}
      submitLabel={t("Cancel auction")}
      pendingLabel={t("Cancelling…")}
      successMessage={t("Auction cancelled")}
      onSuccess={() => router.refresh()}
    >
      {(errors) => (
        <>
          <input type="hidden" name="auctionId" value={auctionId} />
          <FormField
            htmlFor="auction-cancel-reason"
            label={t("Reason")}
            hint={t("Shown to anyone who bid.")}
            error={errors["reason"]}
          >
            <Textarea id="auction-cancel-reason" name="reason" rows={3} maxLength={300} required />
          </FormField>
        </>
      )}
    </ActionFormDialog>
  );
}
