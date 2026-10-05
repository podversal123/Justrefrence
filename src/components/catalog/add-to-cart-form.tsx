"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { AlertCircle, CheckCircle2, Minus, Plus } from "lucide-react";
import { addToCartAction } from "@/server/services/cart-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ApiResult } from "@/lib/api-response";
import type { CatalogKind } from "@/server/domain/catalog/types";

const initialState: ApiResult<null> = { success: true, data: null, meta: { requestId: "" } };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="w-full">
      {pending ? "Adding…" : "Add to cart"}
    </Button>
  );
}

export function AddToCartForm({
  kind,
  itemId,
  maxQty,
}: {
  kind: CatalogKind;
  itemId: string;
  maxQty: number | null;
}) {
  const [state, formAction] = useActionState(addToCartAction, initialState);
  const [qty, setQty] = useState(1);
  const submitted = state !== initialState;
  const allowMultiple = kind === "PRODUCT";

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="itemType" value={kind} />
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="qty" value={qty} />

      {submitted && !state.success ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{state.error.message}</AlertDescription>
        </Alert>
      ) : null}
      {submitted && state.success ? (
        <Alert>
          <CheckCircle2 className="size-4" />
          <AlertDescription>Added to your cart.</AlertDescription>
        </Alert>
      ) : null}

      {allowMultiple ? (
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => setQty((q) => Math.max(1, q - 1))}
          >
            <Minus />
          </Button>
          <Input
            className="w-16 text-center"
            value={qty}
            readOnly
            aria-label="Quantity"
          />
          <Button
            type="button"
            variant="outline"
            size="icon-sm"
            onClick={() => setQty((q) => (maxQty ? Math.min(maxQty, q + 1) : q + 1))}
            disabled={maxQty !== null && qty >= maxQty}
          >
            <Plus />
          </Button>
        </div>
      ) : null}

      <SubmitButton />
    </form>
  );
}
