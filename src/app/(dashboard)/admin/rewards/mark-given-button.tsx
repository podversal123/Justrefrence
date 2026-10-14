"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { markRewardGivenAction } from "@/server/services/reward-actions";

export function MarkGivenButton({ rewardId, title }: { rewardId: string; title: string }) {
  const router = useRouter();
  return (
    <ConfirmationDialog
      trigger={
        <Button size="sm" variant="outline" type="button">
          Mark as given
        </Button>
      }
      title="Mark this reward as given?"
      description={`You are confirming that "${title}" has been handed over to the member. This can't be undone.`}
      action={async (prev, formData) => {
        const result = await markRewardGivenAction(prev, formData);
        if (result.success) router.refresh();
        return result;
      }}
      hiddenFields={{ rewardId }}
      confirmLabel="Mark as given"
      successMessage="Marked as given"
    />
  );
}
