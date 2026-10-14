"use client";

import { useT } from "@/i18n/provider";
import { useActionState } from "@/lib/use-action-state";
import { Button } from "@/components/ui/button";
import { markAllSmsReadAction, markSmsReadAction } from "@/server/services/sms-actions";
import type { ApiResult } from "@/lib/api-response";

const initial: ApiResult<null> = { success: true, data: null, meta: { requestId: "" } };

export function MarkReadButton({ smsId }: { smsId: string }) {
  const t = useT();
  const [, action, pending] = useActionState(markSmsReadAction, initial);
  return (
    <form action={action}>
      <input type="hidden" name="smsId" value={smsId} />
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? t("Marking…") : t("Mark as read")}
      </Button>
    </form>
  );
}

export function MarkAllReadButton() {
  const t = useT();
  const [, action, pending] = useActionState(() => markAllSmsReadAction(), initial);
  return (
    <form action={action}>
      <Button type="submit" variant="outline" size="sm" disabled={pending}>
        {pending ? t("Marking…") : t("Mark all as read")}
      </Button>
    </form>
  );
}
