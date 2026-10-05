"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Wallet as WalletIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ui/confirmation-dialog";
import { toast } from "@/components/ui/toast";
import { adminCreditWalletAction } from "@/server/services/wallet-actions";
import { formatPaise } from "@/lib/money";
import type { ApiResult } from "@/lib/api-response";

/**
 * Manual wallet top-up — the amount/reference are entered as plain visible
 * fields here (ConfirmationDialog only renders hidden fields, see its doc
 * comment), then carried into the dialog's hiddenFields once the admin
 * clicks through to confirm. This is a reconciliation tool, not a payment
 * flow: see adminCreditWalletAction's own doc comment — there's no gateway
 * to verify against, the admin is asserting a credit already happened.
 */
export function WalletTopUpForm({ userId, memberLabel }: { userId: string; memberLabel: string }) {
  const router = useRouter();
  const [amountRupees, setAmountRupees] = useState("");
  const [reference, setReference] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(() => crypto.randomUUID());

  const amount = Number(amountRupees);
  const canSubmit = amountRupees.trim().length > 0 && amount > 0 && reference.trim().length >= 2;
  const amountPaise = Number.isFinite(amount) && amount > 0 ? String(Math.round(amount * 100)) : null;

  async function handleAction(prevState: unknown, formData: FormData): Promise<ApiResult<null>> {
    const result = await adminCreditWalletAction(prevState, formData);
    if (result.success) {
      toast.success("Wallet credited", `${memberLabel}'s wallet was credited with ${formatPaise(amountPaise)}.`);
      setAmountRupees("");
      setReference("");
      setIdempotencyKey(crypto.randomUUID());
      router.refresh();
    }
    return result;
  }

  return (
    <div className="space-y-3 rounded-lg border p-4">
      <div>
        <h2 className="text-sm font-medium">Credit this wallet</h2>
        <p className="text-muted-foreground text-xs">
          Manual reconciliation only — this records a credit you&apos;re asserting already happened (e.g. a
          bank transfer). It is not verified against a payment gateway.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="topup-amount">Amount (₹)</Label>
          <Input
            id="topup-amount"
            type="number"
            min="0.01"
            step="0.01"
            value={amountRupees}
            onChange={(event) => setAmountRupees(event.target.value)}
            placeholder="0.00"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="topup-reference">Reference</Label>
          <Input
            id="topup-reference"
            value={reference}
            onChange={(event) => setReference(event.target.value)}
            placeholder="e.g. Bank transfer dated 2026-01-15"
          />
        </div>
      </div>

      <ConfirmationDialog
        trigger={
          <Button size="sm" disabled={!canSubmit}>
            <WalletIcon />
            Review &amp; credit wallet
          </Button>
        }
        title="Credit this member's wallet?"
        description={`You're recording a ${amountPaise ? formatPaise(amountPaise) : "₹0"} credit to ${memberLabel} with reference "${reference}". Justreference does not verify this against a bank or payment gateway — only confirm if you've already checked it happened.`}
        hiddenFields={{ userId, amountRupees, reference, idempotencyKey }}
        confirmLabel="Credit wallet"
        action={handleAction}
      />
    </div>
  );
}
