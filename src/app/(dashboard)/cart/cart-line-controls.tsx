"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Minus, Plus, Trash2 } from "lucide-react";
import { removeCartItemAction, updateCartItemQtyAction } from "@/server/services/cart-actions";
import { Button } from "@/components/ui/button";
import type { ApiResult } from "@/lib/api-response";

const nullState: ApiResult<null> = { success: true, data: null, meta: { requestId: "" } };

function QtyStepButton({ icon, ...props }: React.ComponentProps<"button"> & { icon: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="hover:bg-muted flex size-6 items-center justify-center rounded-md border disabled:opacity-50"
      {...props}
    >
      {icon}
    </button>
  );
}

export function CartLineControls({
  cartItemId,
  qty,
  maxQty,
  editable,
}: {
  cartItemId: string;
  qty: number;
  maxQty: number | null;
  editable: boolean;
}) {
  const [, decAction] = useActionState(updateCartItemQtyAction, nullState);
  const [, incAction] = useActionState(updateCartItemQtyAction, nullState);
  const [, removeAction] = useActionState(removeCartItemAction, nullState);

  return (
    <div className="flex items-center gap-3">
      {editable ? (
        <div className="flex items-center gap-1.5">
          <form action={decAction}>
            <input type="hidden" name="cartItemId" value={cartItemId} />
            <input type="hidden" name="qty" value={Math.max(1, qty - 1)} />
            <QtyStepButton icon={<Minus className="size-3" />} disabled={qty <= 1} />
          </form>
          <span className="w-6 text-center text-sm">{qty}</span>
          <form action={incAction}>
            <input type="hidden" name="cartItemId" value={cartItemId} />
            <input type="hidden" name="qty" value={qty + 1} />
            <QtyStepButton
              icon={<Plus className="size-3" />}
              disabled={maxQty !== null && qty >= maxQty}
            />
          </form>
        </div>
      ) : (
        <span className="text-muted-foreground text-xs">Qty {qty}</span>
      )}

      <form action={removeAction}>
        <input type="hidden" name="cartItemId" value={cartItemId} />
        <Button type="submit" variant="ghost" size="icon-xs" className="text-muted-foreground">
          <Trash2 />
        </Button>
      </form>
    </div>
  );
}
