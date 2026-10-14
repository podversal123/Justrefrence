"use client";

import { useT } from "@/i18n/provider";
import { useState } from "react";
import { useActionState } from "@/lib/use-action-state";
import { useFormStatus } from "react-dom";
import { AlertCircle } from "lucide-react";
import { updateOrderStatusAction } from "@/server/services/order-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import type { ApiResult } from "@/lib/api-response";
import type { OrderStatus } from "@/server/domain/commerce/order-state-machine";

const initialState: ApiResult<null> = { success: true, data: null, meta: { requestId: "" } };

const TRANSITION_LABELS: Partial<Record<OrderStatus, string>> = {
  PAID: "Mark as paid",
  PROCESSING: "Start processing",
  SHIPPED: "Mark as shipped",
  DELIVERED: "Mark as delivered",
  COMPLETED: "Confirm receipt",
  CANCELLED: "Cancel order",
  REFUNDED: "Mark as refunded",
};

function SubmitButton({ label }: { label: string }) {
  const t = useT();
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? t("Saving…") : label}
    </Button>
  );
}

export function OrderStatusActions({
  orderId,
  transitions,
}: {
  orderId: string;
  transitions: OrderStatus[];
}) {
  const t = useT();
  const [state, formAction] = useActionState(updateOrderStatusAction, initialState);
  const [reason, setReason] = useState("");

  const needsReason = transitions.includes("CANCELLED");

  return (
    <div className="flex flex-col items-end gap-2">
      {!state.success ? (
        <Alert variant="destructive" className="w-full max-w-xs">
          <AlertCircle className="size-4" />
          <AlertDescription>{t(state.error.message)}</AlertDescription>
        </Alert>
      ) : null}

      {needsReason ? (
        <Input
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t("Reason for cancelling")}
          className="max-w-xs"
        />
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        {transitions.map((status) => (
          <form key={status} action={formAction}>
            <input type="hidden" name="orderId" value={orderId} />
            <input type="hidden" name="status" value={status} />
            {status === "CANCELLED" ? <input type="hidden" name="reason" value={reason} /> : null}
            <SubmitButton label={TRANSITION_LABELS[status] ?? status} />
          </form>
        ))}
      </div>
    </div>
  );
}
