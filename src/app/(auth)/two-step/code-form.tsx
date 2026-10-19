"use client";

import { useT } from "@/i18n/provider";
import { useActionState } from "@/lib/use-action-state";
import { useFormStatus } from "react-dom";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ApiResult } from "@/lib/api-response";

const initialState: ApiResult<null> = { success: true, data: null, meta: { requestId: "" } };

function SubmitButton({ label }: { label: string }) {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? t("Checking…") : label}
    </Button>
  );
}

/** One box for the 6-digit code, used both to finish turning two-step on and to sign in with it. */
export function CodeForm({
  action,
  next,
  factorId,
  submitLabel,
}: {
  action: (prev: ApiResult<null>, formData: FormData) => Promise<ApiResult<null>>;
  next?: string;
  factorId?: string;
  submitLabel: string;
}) {
  const t = useT();
  const [state, formAction] = useActionState(action, initialState);
  return (
    <form action={formAction} className="space-y-4" noValidate>
      {!state.success ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{t(state.error.message)}</AlertDescription>
        </Alert>
      ) : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      {factorId ? <input type="hidden" name="factorId" value={factorId} /> : null}
      <div className="space-y-2">
        <Label htmlFor="code">{t("6-digit code")}</Label>
        <Input
          id="code"
          name="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={8}
          required
          className="text-center font-mono text-lg tracking-widest"
          placeholder="123456"
        />
      </div>
      <SubmitButton label={submitLabel} />
    </form>
  );
}
