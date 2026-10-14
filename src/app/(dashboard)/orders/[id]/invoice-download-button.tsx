"use client";

import { useT } from "@/i18n/provider";
import { useState, useTransition } from "react";
import { Download } from "lucide-react";
import { getInvoiceDownloadUrlAction } from "@/server/services/order-actions";
import { Button } from "@/components/ui/button";

export function InvoiceDownloadButton({
  orderId,
  hasInvoice,
}: {
  orderId: string;
  hasInvoice: boolean;
}) {
  const t = useT();
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (!hasInvoice) {
    return <p className="text-muted-foreground text-sm">{t("Invoice not yet available.")}</p>;
  }

  return (
    <div>
      <Button
        variant="outline"
        size="sm"
        disabled={isPending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await getInvoiceDownloadUrlAction(orderId);
            if (result.success) {
              window.open(result.data.url, "_blank", "noopener,noreferrer");
            } else {
              setError(t(result.error.message));
            }
          });
        }}
      >
        <Download />
        {isPending ? t("Preparing…") : t("Download invoice")}
      </Button>
      {error ? <p className="text-destructive mt-1 text-xs">{error}</p> : null}
    </div>
  );
}
