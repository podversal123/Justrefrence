"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2 } from "lucide-react";
import { upsertAddressAction } from "@/server/services/member-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ApiResult } from "@/lib/api-response";

const initialState: ApiResult<null> = { success: true, data: null, meta: { requestId: "" } };

interface AddressValue {
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      {pending ? "Saving…" : "Save address"}
    </Button>
  );
}

export function AddressForm({
  type,
  address,
}: {
  type: "RESIDENCE" | "OFFICE";
  address: AddressValue | null;
}) {
  const [state, formAction] = useActionState(upsertAddressAction, initialState);
  const submitted = state !== initialState;

  return (
    <form action={formAction} className="space-y-4" noValidate>
      <input type="hidden" name="type" value={type} />

      {submitted && !state.success ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{state.error.message}</AlertDescription>
        </Alert>
      ) : null}
      {submitted && state.success ? (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertDescription>Address saved.</AlertDescription>
        </Alert>
      ) : null}

      <div className="space-y-2">
        <Label htmlFor={`${type}-line1`}>Address line 1</Label>
        <Input id={`${type}-line1`} name="line1" defaultValue={address?.line1 ?? ""} required />
      </div>

      <div className="space-y-2">
        <Label htmlFor={`${type}-line2`}>Address line 2</Label>
        <Input id={`${type}-line2`} name="line2" defaultValue={address?.line2 ?? ""} />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${type}-city`}>City</Label>
          <Input id={`${type}-city`} name="city" defaultValue={address?.city ?? ""} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${type}-state`}>State</Label>
          <Input id={`${type}-state`} name="state" defaultValue={address?.state ?? ""} required />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor={`${type}-postalCode`}>PIN code</Label>
          <Input
            id={`${type}-postalCode`}
            name="postalCode"
            defaultValue={address?.postalCode ?? ""}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor={`${type}-country`}>Country</Label>
          <Input
            id={`${type}-country`}
            name="country"
            defaultValue={address?.country ?? "IN"}
            maxLength={2}
            required
          />
        </div>
      </div>

      <SubmitButton />
    </form>
  );
}
