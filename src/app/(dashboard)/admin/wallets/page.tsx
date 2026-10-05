import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Hourglass, Landmark, Search, UserX, Wallet as WalletIcon } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { findMemberByEmail } from "@/server/repositories/identity/member-repository";
import { getOrCreateWallet, listWalletTransactions } from "@/server/repositories/wallet/wallet-repository";
import { getBankAccount } from "@/server/repositories/identity/bank-repository";
import { formatPaise } from "@/lib/money";
import { StatCard } from "@/components/dashboard/stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { WalletTopUpForm } from "./wallet-topup-form";
import { VerifyBankAccountButton } from "./verify-bank-account-button";

export const metadata: Metadata = { title: "Wallets" };

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function AdminWalletsPage({ searchParams }: PageProps) {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  // adminCreditWalletAction is separately gated on "wallet:topup" — this
  // page's own gate is the broader read permission, so staff who can only
  // look up a wallet (not credit it) can still use the search+view half.
  if (!session.permissions.has("wallet:read:any")) redirect("/unauthorized");
  const canTopUp = session.permissions.has("wallet:topup");
  const canVerifyBank = session.permissions.has("bank_account:verify");

  const rawParams = await searchParams;
  const email = typeof rawParams.email === "string" ? rawParams.email.trim() : "";

  const member = email ? await findMemberByEmail(email) : null;
  const wallet = member ? await getOrCreateWallet(member.id) : null;
  const transactions = wallet ? (await listWalletTransactions(wallet.id, { limit: 10 })).items : [];
  const bankAccount = member ? await getBankAccount(member.id) : null;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div>
        <h1>Wallets</h1>
        <p className="text-muted-foreground">Look up a member&apos;s wallet and record manual credits.</p>
      </div>

      <form method="get" className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-sm">
          <Search className="text-muted-foreground absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
          <Input
            name="email"
            defaultValue={email}
            placeholder="Search by member email…"
            className="pl-8"
            aria-label="Search by member email"
          />
        </div>
        <Button type="submit" size="sm">
          Search
        </Button>
      </form>

      {!email ? (
        <EmptyState
          icon={Search}
          title="Search for a member"
          description="Enter a member's email above to view their wallet."
        />
      ) : !member ? (
        <EmptyState icon={UserX} title="No member found" description={`No account matches "${email}".`} />
      ) : (
        <>
          <div className="bg-surface-sunken rounded-lg border p-4">
            <p className="font-medium">{member.fullName ?? "—"}</p>
            <p className="text-muted-foreground text-sm">
              {member.email}
              {member.memberId ? ` · ${member.memberId}` : ""}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <StatCard icon={WalletIcon} label="Balance" value={formatPaise(wallet!.balance.toString())} />
            <StatCard
              icon={Hourglass}
              label="Pending (held for payout)"
              value={formatPaise(wallet!.pendingBalance.toString())}
              tone={wallet!.pendingBalance > 0n ? "warning" : "default"}
            />
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-medium">Recent transactions</h2>
            {transactions.length === 0 ? (
              <EmptyState
                icon={WalletIcon}
                title="No transactions yet"
                description="Nothing has been credited or debited from this wallet."
              />
            ) : (
              <div className="overflow-x-auto rounded-lg border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Balance after</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {transactions.map((tx) => (
                      <TableRow key={tx.id}>
                        <TableCell>
                          <Badge variant="secondary">{tx.type}</Badge>
                        </TableCell>
                        <TableCell
                          className={tx.direction === "CREDIT" ? "text-success font-medium" : "text-destructive font-medium"}
                        >
                          {tx.direction === "CREDIT" ? "+" : "-"}
                          {formatPaise(tx.amount.toString())}
                        </TableCell>
                        <TableCell className="text-muted-foreground">{formatPaise(tx.balanceAfter.toString())}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{tx.createdAt.toLocaleDateString()}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>

          <div className="space-y-2">
            <h2 className="text-sm font-medium">Bank account</h2>
            {!bankAccount ? (
              <EmptyState
                icon={Landmark}
                title="No bank account on file"
                description="This member hasn't added a payout bank account yet."
              />
            ) : (
              <div className="bg-surface-sunken flex items-center justify-between gap-3 rounded-lg border p-4">
                <div>
                  <p className="font-medium">{bankAccount.accountHolderName}</p>
                  <p className="text-muted-foreground text-sm">
                    {bankAccount.accountNoMasked} · {bankAccount.ifsc}
                  </p>
                </div>
                {bankAccount.verifiedAt ? (
                  <Badge variant="success">Verified</Badge>
                ) : canVerifyBank ? (
                  <VerifyBankAccountButton bankAccountId={bankAccount.id} />
                ) : (
                  <Badge variant="warning">Unverified</Badge>
                )}
              </div>
            )}
          </div>

          {canTopUp ? (
            <WalletTopUpForm userId={member.id} memberLabel={member.fullName ?? member.email} />
          ) : (
            <p className="text-muted-foreground text-sm">You don&apos;t have permission to credit wallets.</p>
          )}
        </>
      )}
    </div>
  );
}
