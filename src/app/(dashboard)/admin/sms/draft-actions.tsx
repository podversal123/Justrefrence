"use client";

import { useT } from "@/i18n/provider";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { toast } from "@/components/ui/toast";
import { deleteDraftAction } from "@/server/services/sms-actions";

export function DeleteDraftButton({ draftId }: { draftId: string }) {
  const t = useT();
  const router = useRouter();
  return (
    <ConfirmationDialog
      trigger={
        <Button variant="outline" size="icon-sm">
          <Trash2 />
          <span className="sr-only">{t("Delete draft")}</span>
        </Button>
      }
      title={t("Delete this draft?")}
      description={t("The saved message will be removed. This cannot be undone.")}
      action={async (prev, formData) => {
        const result = await deleteDraftAction(prev, formData);
        if (result.success) {
          toast.success(t("Draft deleted"));
          router.refresh();
        }
        return result;
      }}
      hiddenFields={{ draftId }}
      confirmLabel={t("Delete")}
      variant="destructive"
    />
  );
}
