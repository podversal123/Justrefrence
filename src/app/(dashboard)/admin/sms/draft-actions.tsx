"use client";

import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { toast } from "@/components/ui/toast";
import { deleteDraftAction } from "@/server/services/sms-actions";

export function DeleteDraftButton({ draftId }: { draftId: string }) {
  const router = useRouter();
  return (
    <ConfirmationDialog
      trigger={
        <Button variant="outline" size="icon-sm">
          <Trash2 />
          <span className="sr-only">Delete draft</span>
        </Button>
      }
      title="Delete this draft?"
      description="The saved message will be removed. This cannot be undone."
      action={async (prev, formData) => {
        const result = await deleteDraftAction(prev, formData);
        if (result.success) {
          toast.success("Draft deleted");
          router.refresh();
        }
        return result;
      }}
      hiddenFields={{ draftId }}
      confirmLabel="Delete"
      variant="destructive"
    />
  );
}
