"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { updateVendorProfileAction } from "@/server/services/vendor-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ApiResult } from "@/lib/api-response";

const initialState: ApiResult<null> = { success: true, data: null, meta: { requestId: "" } };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save changes"}
    </Button>
  );
}

export function VendorProfileForm({ businessName }: { businessName: string }) {
  const [state, formAction] = useActionState(updateVendorProfileAction, initialState);
  const submitted = state !== initialState;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      {submitted && !state.success ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{state.error.message}</AlertDescription>
        </Alert>
      ) : null}
      {submitted && state.success ? (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertDescription>Business profile updated.</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="businessName">Business name</Label>
        <Input id="businessName" name="businessName" defaultValue={businessName} required />
      </div>

      <SubmitButton />
    </form>
  );
}
