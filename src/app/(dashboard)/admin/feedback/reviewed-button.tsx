"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { markFeedbackReviewedAction } from "@/server/services/content-actions";
import type { ApiResult } from "@/lib/api-response";

const initial: ApiResult<null> = { success: true, data: null, meta: { requestId: "" } };

export function ReviewedButton({ feedbackId }: { feedbackId: string }) {
  const [, action, pending] = useActionState(markFeedbackReviewedAction, initial);
  return (
    <form action={action}>
      <input type="hidden" name="feedbackId" value={feedbackId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Saving…" : "Mark reviewed"}
      </Button>
    </form>
  );
}
