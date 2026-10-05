"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { createPaymentOrderAction, verifyPaymentCallbackAction } from "@/server/services/payment-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatPaise } from "@/lib/money";

declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => { open: () => void };
  }
}

type Phase = "creating" | "ready" | "verifying" | "done" | "error";

/**
 * Client-side Razorpay checkout trigger. Nothing here ever finalizes
 * payment on its own — createPaymentOrderAction/verifyPaymentCallbackAction
 * are the only things that touch Payment.status, and only after
 * server-side signature verification (see
 * docs/adr/0016-razorpay-payment-integration.md). The widget's own
 * "success" callback is just what tells the browser WHEN to ask the
 * server to verify — it is never trusted on its own.
 */
export function PayNowClient({ checkoutId }: { checkoutId: string }) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("creating");
  const [error, setError] = useState<string | null>(null);
  const [amountPaise, setAmountPaise] = useState<string | null>(null);
  const [, startTransition] = useTransition();
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  useEffect(() => {
    startTransition(async () => {
      const formData = new FormData();
      formData.set("checkoutId", checkoutId);
      formData.set("idempotencyKey", idempotencyKey);
      const result = await createPaymentOrderAction(undefined, formData);

      if (!result.success) {
        setError(result.error.message);
        setPhase("error");
        return;
      }

      setAmountPaise(result.data.amountPaise);

      if (!result.data.keyId) {
        // No live Razorpay credentials configured in this environment —
        // see razorpay-client.ts's dev-fallback. Simulate the verified
        // callback path with a clearly-marked synthetic signature so the
        // flow is still exercisable end to end.
        setPhase("verifying");
        const verifyForm = new FormData();
        verifyForm.set("providerOrderId", result.data.providerOrderId);
        verifyForm.set("providerPaymentId", `pay_dev_${result.data.paymentId}`);
        verifyForm.set("signature", "dev_simulated_signature");
        const verified = await verifyPaymentCallbackAction(undefined, verifyForm);
        if (verified.success) {
          setPhase("done");
          setTimeout(() => router.push("/orders"), 1200);
        } else {
          setError(verified.error.message);
          setPhase("error");
        }
        return;
      }

      setPhase("ready");

      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = () => {
        if (!window.Razorpay) return;
        const razorpay = new window.Razorpay({
          key: result.data.keyId,
          amount: Number(result.data.amountPaise),
          currency: result.data.currency,
          order_id: result.data.providerOrderId,
          handler: (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
            startTransition(async () => {
              setPhase("verifying");
              const verifyForm = new FormData();
              verifyForm.set("providerOrderId", response.razorpay_order_id);
              verifyForm.set("providerPaymentId", response.razorpay_payment_id);
              verifyForm.set("signature", response.razorpay_signature);
              const verified = await verifyPaymentCallbackAction(undefined, verifyForm);
              if (verified.success) {
                setPhase("done");
                setTimeout(() => router.push("/orders"), 1200);
              } else {
                setError(verified.error.message);
                setPhase("error");
              }
            });
          },
        });
        razorpay.open();
      };
      document.body.appendChild(script);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per checkout, idempotencyKey is stable for the page's lifetime
  }, [checkoutId]);

  if (phase === "error") {
    return (
      <Alert variant="destructive">
        <AlertCircle className="size-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  if (phase === "done") {
    return (
      <Alert>
        <CheckCircle2 className="size-4" />
        <AlertDescription>Payment confirmed — redirecting to your orders…</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 py-6 text-center">
      <Loader2 className="size-6 animate-spin" />
      <p className="text-muted-foreground text-sm">
        {phase === "creating" && "Preparing your payment…"}
        {phase === "ready" && "Opening secure checkout…"}
        {phase === "verifying" && "Confirming your payment…"}
      </p>
      {amountPaise ? <p className="font-medium">{formatPaise(amountPaise)}</p> : null}
    </div>
  );
}
