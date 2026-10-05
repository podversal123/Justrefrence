"use client";

import { useState } from "react";
import Link from "next/link";
import { AlertCircle, Landmark } from "lucide-react";
import { requestPayoutAction } from "@/server/services/wallet-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface BankAccountSummary {
  id: string;
  accountHolderName: string;
  accountNoMasked: string;
  ifsc: string;
}

/**
 * Moves real money, so submission is gated behind an explicit confirm step.
 * `requestPayoutAction` returns `ApiResult<{ payoutRequestId: string }>`,
 * not `ApiResult<null>`, so it doesn't fit the generic ConfirmationDialog's
 * `action` prop type exactly — same mismatch pending-approvals-table.tsx
 * hit this session for its approve/reject actions. Following that file's
 * resolution: a local Dialog + manual busy state, calling the Server
 * Action directly with hand-built FormData instead of useActionState, with
 * toast for the result rather than ConfirmationDialog's built-in Alert.
 *
 * Only one bank account can exist per member in this phase (see
 * bank-repository.ts's `getBankAccount` — "One primary payout account per
 * user in this phase"), so this renders the saved account as a fixed
 * summary + hidden field rather than a multi-option <Select>, which would
 * misrepresent the data model.
 */
export function PayoutRequestForm({
  bankAccount,
  hasPin,
}: {
  bankAccount: BankAccountSummary | null;
  hasPin: boolean;
}) {
  // Fresh per mount, not per click — a double-click re-submits the same
  // key, which the backend's idempotency check naturally dedupes. See
  // place-order-form.tsx for the identical pattern.
  const [idempotencyKey] = useState(() => crypto.randomUUID());
  const [amountRupees, setAmountRupees] = useState("");
  const [walletPin, setWalletPin] = useState("");
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!bankAccount) {
    return (
      <EmptyState
        icon={Landmark}
        title="Add a bank account to request a payout"
        description="Your payout destination is managed from your profile."
        action={<Button size="touch" nativeButton={false} render={<Link href="/profile">Go to profile</Link>} />}
      />
    );
  }

  // Narrowed to a local const — TS doesn't retain the null-check narrowing
  // of a parameter inside the nested closures below.
  const account = bankAccount;

  function openConfirm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    const amount = Number(amountRupees);
    if (!amount || amount <= 0) {
      setError("Enter an amount greater than zero.");
      return;
    }
    if (hasPin && !/^\d{6}$/.test(walletPin)) {
      setError("Enter your 6-digit wallet PIN.");
      return;
    }
    setOpen(true);
  }

  async function confirmSubmit() {
    setBusy(true);
    const formData = new FormData();
    formData.set("bankAccountId", account.id);
    formData.set("amountRupees", amountRupees);
    formData.set("idempotencyKey", idempotencyKey);
    if (hasPin) formData.set("walletPin", walletPin);

    const result = await requestPayoutAction(null, formData);
    setBusy(false);
    setOpen(false);

    if (result.success) {
      toast.success("Payout request submitted", "An admin will review it shortly.");
      setAmountRupees("");
      setWalletPin("");
    } else {
      toast.error("Could not submit payout request", result.error.message);
    }
  }

  return (
    <>
      <form onSubmit={openConfirm} className="flex flex-col gap-4" noValidate>
        <div className="bg-muted/50 rounded-lg border p-3 text-sm">
          <p className="font-medium">{account.accountHolderName}</p>
          <p className="text-muted-foreground font-mono text-xs">
            {account.accountNoMasked} · {account.ifsc}
          </p>
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="size-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="amountRupees">Amount (₹)</Label>
            <Input
              id="amountRupees"
              type="number"
              min="1"
              step="0.01"
              inputMode="decimal"
              value={amountRupees}
              onChange={(event) => setAmountRupees(event.target.value)}
              required
            />
          </div>
          {hasPin ? (
            <div className="space-y-2">
              <Label htmlFor="walletPin">Wallet PIN</Label>
              <Input
                id="walletPin"
                type="password"
                inputMode="numeric"
                maxLength={6}
                value={walletPin}
                onChange={(event) => setWalletPin(event.target.value)}
                required
              />
            </div>
          ) : null}
        </div>

        <div>
          <Button type="submit" size="touch">
            Request payout
          </Button>
        </div>
      </form>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request this payout?</DialogTitle>
            <DialogDescription>
              ₹{amountRupees} will be transferred to {account.accountNoMasked}. This moves money out of your
              wallet balance and can&apos;t be undone once an admin approves it.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button type="button" onClick={confirmSubmit} disabled={busy}>
              {busy ? "Submitting…" : "Confirm request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
