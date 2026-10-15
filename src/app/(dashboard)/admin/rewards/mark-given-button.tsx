"use client";

import { useT } from "@/i18n/provider";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { markRewardGivenAction } from "@/server/services/reward-actions";

export function MarkGivenButton({ rewardId, title }: { rewardId: string; title: string }) {
  const t = useT();
  const router = useRouter();
  return (
    <ConfirmationDialog
      trigger={
        <Button size="sm" variant="outline" type="button">
          {t("Mark as given")}
        </Button>
      }
      title={t("Mark this reward as given?")}
      description={`You are confirming that "${title}" has been handed over to the member. This can't be undone.`}
      action={async (prev, formData) => {
        const result = await markRewardGivenAction(prev, formData);
        if (result.success) router.refresh();
        return result;
      }}
      hiddenFields={{ rewardId }}
      confirmLabel={t("Mark as given")}
      successMessage={t("Marked as given")}
    />
  );
}
