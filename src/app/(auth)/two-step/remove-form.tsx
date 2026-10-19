"use client";

import { useT } from "@/i18n/provider";
import { useActionState } from "@/lib/use-action-state";
import { useFormStatus } from "react-dom";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { removeTwoStepAction } from "@/server/services/two-step-actions";
import type { ApiResult } from "@/lib/api-response";

const initialState: ApiResult<null> = { success: true, data: null, meta: { requestId: "" } };

function RemoveButton() {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" className="w-full" disabled={pending}>
      {pending ? t("Saving…") : t("Turn off two-step login")}
    </Button>
  );
}

export function RemoveForm() {
  const t = useT();
  const [state, formAction] = useActionState(removeTwoStepAction, initialState);
  return (
    <form action={formAction} className="space-y-3">
      {!state.success ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{t(state.error.message)}</AlertDescription>
        </Alert>
      ) : null}
      <RemoveButton />
    </form>
  );
}
