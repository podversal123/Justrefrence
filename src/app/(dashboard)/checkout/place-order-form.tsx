"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle } from "lucide-react";
import { placeOrderAction } from "@/server/services/order-actions";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ApiResult } from "@/lib/api-response";

const initialState: ApiResult<null> = { success: true, data: null, meta: { requestId: "" } };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="lg" disabled={pending}>
      {pending ? "Placing order…" : "Place order"}
    </Button>
  );
}

export function PlaceOrderForm({ couponCode }: { couponCode?: string }) {
  const [state, formAction] = useActionState(placeOrderAction, initialState);
  // Generated once per page load (not per click) — a re-submission of the
  // SAME form (double-click, retried request) reuses the same key, which
  // is exactly what makes checkout-service.ts's idempotency check work:
  // the server returns the already-placed order instead of creating a
  // second one. See docs/adr/0013-commerce-money-math.md.
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  return (
    <form action={formAction} className="flex flex-col items-end gap-2">
      <input type="hidden" name="idempotencyKey" value={idempotencyKey} />
      {couponCode ? <input type="hidden" name="couponCode" value={couponCode} /> : null}

      {!state.success ? (
        <Alert variant="destructive" className="w-full">
          <AlertCircle className="size-4" />
          <AlertDescription>{state.error.message}</AlertDescription>
        </Alert>
      ) : null}

      <SubmitButton />
    </form>
  );
}
