"use client";

import { Trash2 } from "lucide-react";
import { useT } from "@/i18n/provider";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { deleteMessageDraftAction } from "@/server/services/message-actions";

export function DeleteDraftButton({ draftId }: { draftId: string }) {
  const t = useT();
  return (
    <ConfirmationDialog
      trigger={
        <Button variant="ghost" size="sm" aria-label={t("Delete draft")}>
          <Trash2 />
          {t("Delete")}
        </Button>
      }
      title={t("Delete this draft?")}
      description={t("It is removed for good. A message you already sent is not affected.")}
      action={deleteMessageDraftAction}
      hiddenFields={{ draftId }}
      confirmLabel={t("Delete")}
      successMessage={t("Draft deleted")}
      variant="destructive"
    />
  );
}
