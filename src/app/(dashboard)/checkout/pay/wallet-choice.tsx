"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, CheckCircle2, Wallet } from "lucide-react";
import { useT } from "@/i18n/provider";
import { payWithWalletAction } from "@/server/services/payment-actions";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { formatPaise } from "@/lib/money";
import { PayNowClient } from "./pay-now-client";

/**
 * Shown only when the wallet can cover the whole amount. The member picks the wallet or pays online;
 * the online flow starts only if they choose it, so no payment order is created needlessly.
 */
export function WalletOrCardChoice({
  checkoutId,
  amount,
  balance,
}: {
  checkoutId: string;
  amount: string;
  balance: string;
}) {
  const t = useT();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [mode, setMode] = useState<"choose" | "online" | "done">("choose");
  const [error, setError] = useState<string | null>(null);
  const [idempotencyKey] = useState(() => crypto.randomUUID());

  if (mode === "online") return <PayNowClient checkoutId={checkoutId} />;

  if (mode === "done") {
    return (
      <Alert>
        <CheckCircle2 className="size-4" />
        <AlertDescription>{t("Paid from your wallet. Redirecting to your orders…")}</AlertDescription>
      </Alert>
    );
  }

  function payFromWallet() {
    setError(null);
    startTransition(async () => {
      const formData = new FormData();
      formData.set("checkoutId", checkoutId);
      formData.set("idempotencyKey", idempotencyKey);
      const result = await payWithWalletAction(undefined, formData);
      if (!result.success) {
        setError(t(result.error.message));
        return;
      }
      setMode("done");
      setTimeout(() => router.push("/orders"), 1200);
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-md border p-3 text-sm">
        <p className="text-muted-foreground">{t("Amount to pay")}</p>
        <p className="text-lg font-semibold">{formatPaise(amount)}</p>
        <p className="text-muted-foreground mt-1">
          {t("Wallet balance")}: {formatPaise(balance)}
        </p>
      </div>
      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="size-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Button onClick={payFromWallet} disabled={pending}>
        <Wallet className="size-4" />
        {pending ? t("Paying…") : t("Pay from wallet")}
      </Button>
      <Button variant="outline" onClick={() => setMode("online")} disabled={pending}>
        {t("Pay online instead")}
      </Button>
    </div>
  );
}
