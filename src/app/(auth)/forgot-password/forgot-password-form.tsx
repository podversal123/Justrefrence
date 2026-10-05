"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import Link from "next/link";
import { CheckCircle2 } from "lucide-react";
import { forgotPasswordAction } from "@/server/services/auth-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ApiResult } from "@/lib/api-response";

const initialState: ApiResult<{ message: string }> = {
  success: true,
  data: null as unknown as { message: string },
  meta: { requestId: "" },
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "Sending…" : "Send reset link"}
    </Button>
  );
}

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(forgotPasswordAction, initialState);
  const submitted = state.success && state.data !== null;

  if (submitted) {
    return (
      <Alert>
        <CheckCircle2 className="size-4" />
        <AlertDescription>{state.data.message}</AlertDescription>
      </Alert>
    );
  }

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {!state.success ? (
        <Alert variant="destructive">
          <AlertDescription>{state.error.message}</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
          placeholder="you@example.com"
        />
      </div>

      <SubmitButton />

      <p className="text-muted-foreground text-center text-sm">
        <Link href="/login" className="underline underline-offset-4">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
