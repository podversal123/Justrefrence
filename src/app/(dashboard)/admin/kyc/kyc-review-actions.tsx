"use client";

import { useT } from "@/i18n/provider";
import { Check, X } from "lucide-react";
import { reviewKycDocumentAction } from "@/server/services/kyc-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import type { ApiResult } from "@/lib/api-response";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";

/**
 * Runs the review and raises the confirmation the moment the server answers. Doing it here, not in an
 * effect, matters: a reviewed document leaves the "to review" list straight away, so the buttons are
 * gone before an effect would run and the admin would get no sign that it worked.
 */
function reviewWithToast(message: string) {
  return async (previous: unknown, formData: FormData): Promise<ApiResult<null>> => {
    const result = await reviewKycDocumentAction(previous, formData);
    if (result.success) toast.success(message);
    return result;
  };
}

/** Verify or reject one pending document. Rejecting asks for the reason, which the person sees. */
export function KycReviewActions({
  documentId,
  documentLabel,
  personName,
  panOnFile,
}: {
  documentId: string;
  documentLabel: string;
  personName: string;
  panOnFile: string | null;
}) {
  const t = useT();
  return (
    <div className="flex flex-wrap gap-2">
      <ConfirmationDialog
        trigger={
          <Button size="sm">
            <Check />
            {t("Verify")}
          </Button>
        }
        title={t("Verify {name}'s {document}?", { name: personName, document: documentLabel })}
        description={
          panOnFile
            ? t("Check that the card shows the same PAN number as on file: {pan}.", {
                pan: panOnFile,
              })
            : t("Check the document carefully before you verify it.")
        }
        action={reviewWithToast(t("Document verified"))}
        hiddenFields={{ documentId, decision: "VERIFY" }}
        confirmLabel={t("Yes, verify")}
      />
      <ConfirmationDialog
        trigger={
          <Button size="sm" variant="outline">
            <X />
            {t("Reject")}
          </Button>
        }
        title={t("Reject {name}'s {document}?", { name: personName, document: documentLabel })}
        description={t("They will be told to upload it again, along with your note.")}
        action={reviewWithToast(t("Document rejected"))}
        hiddenFields={{ documentId, decision: "REJECT" }}
        confirmLabel={t("Reject")}
        variant="destructive"
      >
        <div className="space-y-2">
          <Label htmlFor={`reject-reason-${documentId}`}>{t("What should they fix?")}</Label>
          <Textarea
            id={`reject-reason-${documentId}`}
            name="reason"
            rows={3}
            maxLength={500}
            required
            placeholder={t("For example: the photo is blurry, please upload a clear one.")}
          />
        </div>
      </ConfirmationDialog>
    </div>
  );
}
