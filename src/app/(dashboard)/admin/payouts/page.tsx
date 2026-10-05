import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Hourglass, PiggyBank } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { getPayoutRequestById, listAllPayoutRequests } from "@/server/repositories/wallet/payout-repository";
import { getPendingPayouts } from "@/server/repositories/dashboard/dashboard-repository";
import { adminPayoutListQuerySchema } from "@/lib/schemas/wallet";
import { formatPaise } from "@/lib/money";
import { StatCard } from "@/components/dashboard/stat-card";
import { CursorPagination } from "@/components/ui/pagination";
import { PayoutFilters } from "./payout-filters";
import { PayoutsTable, type PayoutDetailRow } from "./payouts-table";

export const metadata: Metadata = { title: "Payouts" };

interface PageProps {
  searchParams: Promise<Record<string, string | undefined>>;
}

export default async function PayoutsPage({ searchParams }: PageProps) {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  // No separate "payout:read" permission exists in the catalog (see
  // src/server/auth/permissions.ts) — updatePayoutStatusAction itself is
  // gated solely on "payout:approve", so that's also the correct gate for
  // viewing this queue at all.
  if (!session.permissions.has("payout:approve")) redirect("/unauthorized");

  const rawParams = await searchParams;
  const parsed = adminPayoutListQuerySchema.safeParse(rawParams);
  const query = parsed.success ? parsed.data : adminPayoutListQuerySchema.parse({});

  const [{ items, nextCursor }, pending] = await Promise.all([
    listAllPayoutRequests(query),
    // Platform-wide, pagination-independent aggregate — already exists for
    // the admin dashboard's "Pending payouts" stat tile
    // (src/server/repositories/dashboard/dashboard-repository.ts), reused
    // here instead of deriving a total from just the current page.
    getPendingPayouts(),
  ]);

  // Enrich each row with the "full detail" fields that listAllPayoutRequests
  // doesn't include (the requester-recorded payout transaction: transfer
  // reference / TDS / net amount — only ever present once a request reaches
  // PAID) via getPayoutRequestById, exactly as the brief specifies for the
  // detail drawer. Bounded by the page's own limit (<=100 rows), done
  // server-side so no bigint/Date ever crosses into the Client Component
  // unserialized (see src/lib/money.ts's "Amounts are strings at this
  // boundary" comment).
  const details = await Promise.all(items.map((item) => getPayoutRequestById(item.id)));

  const rows: PayoutDetailRow[] = items.map((item, index) => {
    const detail = details[index];
    return {
      id: item.id,
      amount: item.amount.toString(),
      status: item.status,
      createdAt: item.createdAt,
      rejectedReason: item.rejectedReason,
      requester: item.requester,
      bankAccount: {
        accountHolderName: detail?.bankAccount.accountHolderName ?? "",
        accountNoMasked: item.bankAccount.accountNoMasked,
        ifsc: item.bankAccount.ifsc,
        branchAddress: detail?.bankAccount.branchAddress ?? null,
      },
      transaction: detail?.transaction
        ? {
            transferReference: detail.transaction.transferReference,
            tdsDeducted: detail.transaction.tdsDeducted.toString(),
            netAmount: detail.transaction.netAmount.toString(),
            paidAt: detail.transaction.paidAt,
          }
        : null,
    };
  });

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1>Payouts</h1>
        <p className="text-muted-foreground">Review, approve, and record member payout requests.</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:max-w-md">
        <StatCard
          icon={Hourglass}
          label="Pending requests"
          value={pending.count.toLocaleString()}
          tone={pending.count > 0 ? "warning" : "default"}
        />
        <StatCard
          icon={PiggyBank}
          label="Pending amount"
          value={formatPaise(pending.amount.toString())}
          tone={pending.count > 0 ? "warning" : "default"}
        />
      </div>

      <PayoutFilters />

      <PayoutsTable items={rows} />

      <CursorPagination nextCursor={nextCursor} />
    </div>
  );
}
