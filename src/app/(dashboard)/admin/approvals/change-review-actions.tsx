"use client";

import { Check, X } from "lucide-react";
import { reviewChangeAction } from "@/server/services/approval-actions";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import type { ApiResult } from "@/lib/api-response";

/**
 * Runs the decision and raises the confirmation the moment the server answers. A decided request leaves
 * the pending list straight away, so a toast raised from an effect would find its buttons already gone.
 */
function decideWithToast(message: string) {
  return async (previous: unknown, formData: FormData): Promise<ApiResult<null>> => {
    const result = await reviewChangeAction(previous, formData);
    if (result.success) toast.success(message);
    return result;
  };
}

export function ChangeReviewActions({
  requestId,
  recordName,
}: {
  requestId: string;
  recordName: string;
}) {
  return (
    <div className="flex flex-wrap justify-end gap-2">
      <ConfirmationDialog
        trigger={
          <Button size="sm">
            <Check />
            Approve
          </Button>
        }
        title={`Approve the change to ${recordName}?`}
        description="The change is applied right away and the admin is told."
        action={decideWithToast("Change approved and applied")}
        hiddenFields={{ requestId, decision: "APPROVE" }}
        confirmLabel="Yes, approve"
      />
      <ConfirmationDialog
        trigger={
          <Button size="sm" variant="outline">
            <X />
            Reject
          </Button>
        }
        title={`Reject the change to ${recordName}?`}
        description="Nothing is changed. The admin sees your note."
        action={decideWithToast("Change rejected")}
        hiddenFields={{ requestId, decision: "REJECT" }}
        confirmLabel="Reject"
        variant="destructive"
      >
        <div className="space-y-2">
          <Label htmlFor={`reject-note-${requestId}`}>Why are you rejecting it?</Label>
          <Textarea
            id={`reject-note-${requestId}`}
            name="note"
            rows={3}
            maxLength={500}
            required
            placeholder="So the admin knows what to change."
          />
        </div>
      </ConfirmationDialog>
    </div>
  );
}
