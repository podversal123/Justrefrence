"use client";

import { useActionState, useEffect, useRef } from "react";
import { useFormStatus } from "react-dom";
import { setSubscriptionPlanActiveAction } from "@/server/services/subscription-actions";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import type { ApiResult } from "@/lib/api-response";

const nullState: ApiResult<null> = { success: true, data: null, meta: { requestId: "" } };

function ToggleButton({ active }: { active: boolean }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? "Saving…" : active ? "Deactivate" : "Activate"}
    </Button>
  );
}

/** Simple inline toggle — see the brief: a full edit dialog isn't warranted for a single boolean flip. */
export function PlanActiveToggle({ planId, active }: { planId: string; active: boolean }) {
  const [state, formAction] = useActionState(setSubscriptionPlanActiveAction, nullState);
  const lastRequestId = useRef(state.meta.requestId);

  useEffect(() => {
    if (!state.meta.requestId || state.meta.requestId === lastRequestId.current) return;
    lastRequestId.current = state.meta.requestId;
    if (state.success) {
      toast.success(active ? "Plan deactivated" : "Plan activated");
    } else {
      toast.error("Could not update plan", state.error.message);
    }
  }, [state, active]);

  return (
    <form action={formAction}>
      <input type="hidden" name="planId" value={planId} />
      <input type="hidden" name="active" value={(!active).toString()} />
      <ToggleButton active={active} />
    </form>
  );
}
