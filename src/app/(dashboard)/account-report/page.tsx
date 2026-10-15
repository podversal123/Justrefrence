import { getFormat, getT } from "@/i18n/server";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import {
  ArrowDownLeft,
  ArrowUpRight,
  Percent,
  ReceiptText,
  Wallet as WalletIcon,
} from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import {
  getOrCreateWallet,
  listLedgerReport,
  sumLedgerReport,
} from "@/server/repositories/wallet/wallet-repository";
import { sumTdsForUser } from "@/server/repositories/tax/tds-repository";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { CursorPagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatPaise } from "@/lib/money";
import { transactionDescription, transactionLabel } from "@/lib/wallet-labels";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Account report") };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function AccountReportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const t = await getT();
  const { formatDate } = await getFormat();
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("wallet:read")) redirect("/unauthorized");

  const params = await searchParams;
  const from = params["from"] && DATE_RE.test(params["from"]) ? params["from"] : undefined;
  const to = params["to"] && DATE_RE.test(params["to"]) ? params["to"] : undefined;
  const active =
    params["type"] === "credit" ? "credit" : params["type"] === "debit" ? "debit" : undefined;
  const direction = active === "credit" ? "CREDIT" : active === "debit" ? "DEBIT" : undefined;

  let loaded;
  try {
    const wallet = await getOrCreateWallet(session.userId);
    const [report, totals, tds] = await Promise.all([
      listLedgerReport(wallet.id, { from, to, direction, cursor: params["cursor"] }),
      sumLedgerReport(wallet.id, { from, to }),
      sumTdsForUser(session.userId, { from, to }),
    ]);
    loaded = { wallet, report, totals, tds };
  } catch {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        <h1>{t("Account report")}</h1>
        <ErrorState
          title={t("Couldn't load your account report")}
          description={t("Something went wrong. Please try again shortly.")}
        />
      </div>
    );
  }
  const { wallet, report, totals, tds } = loaded;

  const filtered = Boolean(from || to);
  const period = filtered ? t("In the selected dates") : t("All time");
  const tabHref = (value?: "credit" | "debit") => {
    const q = new URLSearchParams();
    if (value) q.set("type", value);
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    return `/account-report${q.size ? `?${q}` : ""}` as Route;
  };
  const tabs: { label: string; value?: "credit" | "debit" }[] = [
    { label: t("All"), value: undefined },
    { label: t("Credit"), value: "credit" },
    { label: t("Debit"), value: "debit" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1>{t("Account report")}</h1>
        <p className="text-muted-foreground">
          {t("Every credit and debit on your wallet, with the tax deducted on payouts.")}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={WalletIcon}
          label={t("Balance now")}
          value={formatPaise(wallet.balance.toString())}
        />
        <StatCard
          icon={ArrowDownLeft}
          label={t("Total credit")}
          value={formatPaise(totals.credit.toString())}
          sublabel={period}
          tone="success"
        />
        <StatCard
          icon={ArrowUpRight}
          label={t("Total debit")}
          value={formatPaise(totals.debit.toString())}
          sublabel={period}
        />
        <StatCard
          icon={Percent}
          label={t("TDS deducted")}
          value={formatPaise(tds.toString())}
          sublabel={period}
          tone={tds > 0n ? "warning" : "muted"}
        />
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3" role="search">
        {active ? <input type="hidden" name="type" value={active} /> : null}
        <div className="space-y-1">
          <label htmlFor="rep-from" className="text-xs font-medium">
            {t("From")}
          </label>
          <Input id="rep-from" name="from" type="date" defaultValue={from} className="w-40" />
        </div>
        <div className="space-y-1">
          <label htmlFor="rep-to" className="text-xs font-medium">
            {t("To")}
          </label>
          <Input id="rep-to" name="to" type="date" defaultValue={to} className="w-40" />
        </div>
        <Button type="submit">{t("Apply")}</Button>
        {filtered ? (
          <Button
            variant="ghost"
            nativeButton={false}
            render={<Link href={tabHref(active)}>{t("Clear")}</Link>}
          />
        ) : null}
      </form>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Button
            key={tab.label}
            variant={tab.value === active ? "default" : "outline"}
            size="sm"
            nativeButton={false}
            render={<Link href={tabHref(tab.value)}>{tab.label}</Link>}
          />
        ))}
      </div>

      {report.items.length === 0 ? (
        <EmptyState
          icon={ReceiptText}
          title={t("No entries found")}
          description={t("Credits and debits to your wallet will show up here.")}
        />
      ) : (
        <div className="surface-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Date")}</TableHead>
                <TableHead>{t("Description")}</TableHead>
                <TableHead className="text-right">{t("Credit")}</TableHead>
                <TableHead className="text-right">{t("Debit")}</TableHead>
                <TableHead className="text-right">{t("Balance")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {report.items.map((tx) => (
                <TableRow key={tx.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(tx.createdAt)}</TableCell>
                  <TableCell>
                    <div className="font-medium">{t(transactionLabel(tx.type))}</div>
                    <div className="text-muted-foreground text-xs">
                      {t(transactionDescription(tx.type, tx.referenceType))}
                    </div>
                  </TableCell>
                  <TableCell className="text-success text-right tabular-nums">
                    {tx.direction === "CREDIT" ? formatPaise(tx.amount.toString()) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {tx.direction === "DEBIT" ? formatPaise(tx.amount.toString()) : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatPaise(tx.balanceAfter.toString())}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CursorPagination nextCursor={report.nextCursor} />
    </div>
  );
}
