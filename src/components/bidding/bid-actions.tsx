"use client";

import { useT } from "@/i18n/provider";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { ActionFormDialog } from "@/components/ui/action-form";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { ActionForm } from "@/components/ui/action-form";
import {
  awardBidAction,
  cancelRequirementAction,
  payForAwardedBidAction,
} from "@/server/services/bidding-actions";

export function AwardButton({
  requirementId,
  bidId,
  bidderLabel,
  total,
}: {
  requirementId: string;
  bidId: string;
  bidderLabel: string;
  total: string;
}) {
  const t = useT();
  const router = useRouter();
  return (
    <ConfirmationDialog
      trigger={
        <Button size="sm" type="button">
          {t("Award")}
        </Button>
      }
      title={t("Award to {name}?", { name: bidderLabel })}
      description={t(
        "You are accepting their offer of {total}. Every other bidder is told their bid was not selected. This can't be undone.",
        { total },
      )}
      action={async (prev, formData) => {
        const result = await awardBidAction(prev, formData);
        if (result.success) router.refresh();
        return result;
      }}
      hiddenFields={{ requirementId, bidId }}
      confirmLabel={t("Award bid")}
      successMessage={t("Bid awarded")}
    />
  );
}

export function CancelRequirementButton({ requirementId }: { requirementId: string }) {
  const t = useT();
  const router = useRouter();
  return (
    <ActionFormDialog
      trigger={
        <Button variant="outline" size="sm" type="button">
          {t("Cancel requirement")}
        </Button>
      }
      title={t("Cancel this requirement?")}
      description={t("Bidding stops immediately and every bidder is told it was cancelled.")}
      action={cancelRequirementAction}
      submitLabel={t("Cancel requirement")}
      pendingLabel={t("Cancelling…")}
      successMessage={t("Requirement cancelled")}
      onSuccess={() => router.refresh()}
    >
      {(errors) => (
        <>
          <input type="hidden" name="requirementId" value={requirementId} />
          <FormField
            htmlFor="cancel-reason"
            label={t("Reason")}
            hint={t("Shown to the bidders.")}
            error={errors["reason"]}
          >
            <Textarea id="cancel-reason" name="reason" rows={3} maxLength={300} required />
          </FormField>
        </>
      )}
    </ActionFormDialog>
  );
}

/** The buyer confirms the awarded offer; the order is created at the winning price and they go on to pay. */
export function PayForBidForm({ requirementId, total }: { requirementId: string; total: string }) {
  const t = useT();
  return (
    <ActionForm
      action={payForAwardedBidAction}
      submitLabel={`${t("Place order and pay")} ${total}`}
      pendingLabel={t("Placing your order…")}
      successMessage={t("Order placed")}
    >
      {() => <input type="hidden" name="requirementId" value={requirementId} />}
    </ActionForm>
  );
}
