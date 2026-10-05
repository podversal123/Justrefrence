"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { ActionFormDialog } from "@/components/ui/action-form";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { awardBidAction, cancelRequirementAction } from "@/server/services/bidding-actions";

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
  const router = useRouter();
  return (
    <ConfirmationDialog
      trigger={
        <Button size="sm" type="button">
          Award
        </Button>
      }
      title={`Award to ${bidderLabel}?`}
      description={`You are accepting their offer of ${total}. Every other bidder is told their bid was not selected. This can't be undone.`}
      action={async (prev, formData) => {
        const result = await awardBidAction(prev, formData);
        if (result.success) router.refresh();
        return result;
      }}
      hiddenFields={{ requirementId, bidId }}
      confirmLabel="Award bid"
      successMessage="Bid awarded"
    />
  );
}

export function CancelRequirementButton({ requirementId }: { requirementId: string }) {
  const router = useRouter();
  return (
    <ActionFormDialog
      trigger={
        <Button variant="outline" size="sm" type="button">
          Cancel requirement
        </Button>
      }
      title="Cancel this requirement?"
      description="Bidding stops immediately and every bidder is told it was cancelled."
      action={cancelRequirementAction}
      submitLabel="Cancel requirement"
      pendingLabel="Cancelling…"
      successMessage="Requirement cancelled"
      onSuccess={() => router.refresh()}
    >
      {(errors) => (
        <>
          <input type="hidden" name="requirementId" value={requirementId} />
          <FormField
            htmlFor="cancel-reason"
            label="Reason"
            hint="Shown to the bidders."
            error={errors["reason"]}
          >
            <Textarea id="cancel-reason" name="reason" rows={3} maxLength={300} required />
          </FormField>
        </>
      )}
    </ActionFormDialog>
  );
}
