"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { markMessageReadAction } from "@/server/services/message-actions";
import type { ApiResult } from "@/lib/api-response";

const initial: ApiResult<null> = { success: true, data: null, meta: { requestId: "" } };

export function MarkReadButton({ messageId }: { messageId: string }) {
  const [, action, pending] = useActionState(markMessageReadAction, initial);
  return (
    <form action={action}>
      <input type="hidden" name="messageId" value={messageId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? "Marking…" : "Mark as read"}
      </Button>
    </form>
  );
}
