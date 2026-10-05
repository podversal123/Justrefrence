import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Clock, Landmark, ReceiptText, ShieldCheck, Wallet as WalletIcon } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { getOrCreateWallet, listWalletTransactions } from "@/server/repositories/wallet/wallet-repository";
import { listPayoutRequestsForWallet } from "@/server/repositories/wallet/payout-repository";
import { getBankAccount } from "@/server/repositories/identity/bank-repository";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { StatCard } from "@/components/dashboard/stat-card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { SetWalletPinForm } from "./set-wallet-pin-form";
import { PayoutRequestForm } from "./payout-request-form";

export const metadata: Metadata = { title: "My wallet" };

/** "TOPUP" -> "Topup" — same enum-display convention as customer-dashboard.tsx. */
function formatTransactionType(type: string): string {
  return type
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

export default async function WalletPage() {
  const session = await getAuthSession();
  if (!session) redirect("/login");

  // getOrCreateWallet() creates the row if missing, so this should
  // basically never return null for a valid session — only a genuine DB
  // failure lands here, which gets the full-page ErrorState below. The
  // "wallet exists but zero everything" (brand-new member) case is a
  // *successful* fetch and falls through to the normal render with empty
  // sections, not this branch.
  let wallet: Awaited<ReturnType<typeof getOrCreateWallet>> | null = null;
  try {
    wallet = await getOrCreateWallet(session.userId);
  } catch {
    wallet = null;
  }

  if (!wallet) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
        <div>
          <h1>My wallet</h1>
        </div>
        <ErrorState
          title="Couldn't load your wallet"
          description="Something went wrong loading your wallet. Please try again shortly."
        />
      </div>
    );
  }

  const [txSettled, payoutSettled, bankSettled] = await Promise.allSettled([
    listWalletTransactions(wallet.id, { limit: 10 }),
    listPayoutRequestsForWallet(wallet.id, { limit: 10 }),
    getBankAccount(session.userId),
  ]);

  const transactions = txSettled.status === "fulfilled" ? txSettled.value.items : [];
  const transactionsError = txSettled.status === "rejected";

  const payouts = payoutSettled.status === "fulfilled" ? payoutSettled.value.items : [];
  const payoutsError = payoutSettled.status === "rejected";

  const bankAccount = bankSettled.status === "fulfilled" ? bankSettled.value : null;
  const bankAccountError = bankSettled.status === "rejected";

  const hasPin = wallet.walletPinHash !== null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8">
      <div>
        <h1>My wallet</h1>
        <p className="text-muted-foreground">Your balance, payout requests, and transaction history.</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <StatCard icon={WalletIcon} label="Available balance" value={formatPaise(wallet.balance.toString())} />
        <StatCard
          icon={Clock}
          label="Pending balance"
          value={formatPaise(wallet.pendingBalance.toString())}
          sublabel="Held against open payout requests"
          tone={wallet.pendingBalance > 0n ? "warning" : "muted"}
        />
      </div>

      <section className="rounded-xl border p-4 sm:p-5">
        <h2 className="text-base font-semibold">Wallet PIN</h2>
        <p className="text-muted-foreground text-sm">
          Optional — adds a confirmation step when you request a payout.
        </p>
        <div className="mt-4">
          {hasPin ? (
            <div className="text-success flex items-center gap-2 text-sm font-medium">
              <ShieldCheck className="size-4" />
              PIN is set
            </div>
          ) : (
            <SetWalletPinForm />
          )}
        </div>
      </section>

      <section className="rounded-xl border p-4 sm:p-5">
        <h2 className="text-base font-semibold">Request a payout</h2>
        <p className="text-muted-foreground mb-4 text-sm">
          Funds move from your available balance into pending until an admin approves or rejects the request.
        </p>
        {bankAccountError ? (
          <ErrorState title="Couldn't load your bank account" />
        ) : (
          <PayoutRequestForm bankAccount={bankAccount} hasPin={hasPin} />
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Recent transactions</h2>
        {transactionsError ? (
          <ErrorState title="Couldn't load your transactions" />
        ) : transactions.length === 0 ? (
          <EmptyState
            icon={ReceiptText}
            title="No transactions yet"
            description="Credits and debits to your wallet will show up here."
          />
        ) : (
          <div className="bg-surface-sunken divide-border divide-y rounded-xl border">
            {transactions.map((tx) => (
              <div key={tx.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full",
                      tx.direction === "CREDIT" ? "bg-success/10 text-success" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {tx.direction === "CREDIT" ? (
                      <ArrowDownLeft className="size-4" aria-hidden="true" />
                    ) : (
                      <ArrowUpRight className="size-4" aria-hidden="true" />
                    )}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{formatTransactionType(tx.type)}</p>
                    <p className="text-muted-foreground text-xs">{tx.createdAt.toLocaleString()}</p>
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className={cn("text-sm font-medium", tx.direction === "CREDIT" && "text-success")}>
                    {tx.direction === "CREDIT" ? "+" : "−"}
                    {formatPaise(tx.amount.toString())}
                  </p>
                  <p className="text-muted-foreground text-xs">Balance {formatPaise(tx.balanceAfter.toString())}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Recent payout requests</h2>
        {payoutsError ? (
          <ErrorState title="Couldn't load your payout requests" />
        ) : payouts.length === 0 ? (
          <EmptyState
            icon={Landmark}
            title="No payout requests yet"
            description="Requests you submit will show up here with their status."
          />
        ) : (
          <div className="bg-surface-sunken divide-border divide-y rounded-xl border">
            {payouts.map((payout) => (
              <div key={payout.id} className="flex flex-col gap-1 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-medium">{formatPaise(payout.amount.toString())}</span>
                  <div className="flex items-center gap-3">
                    <span className="text-muted-foreground text-xs">{payout.createdAt.toLocaleDateString()}</span>
                    <StatusBadge status={payout.status} />
                  </div>
                </div>
                {payout.status === "REJECTED" && payout.rejectedReason ? (
                  <p className="text-destructive text-xs">{payout.rejectedReason}</p>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
