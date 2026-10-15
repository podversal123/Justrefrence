import { getFormat, getT } from "@/i18n/server";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Download, Percent, Receipt, Wallet } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { listTdsRecords, sumTds } from "@/server/repositories/tax/tds-repository";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
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
import { financialYearDays } from "@/lib/day-range";
import { maskPan } from "@/server/domain/identity/masking";
import { getFinancialYear } from "@/server/domain/commerce/financial-year";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("TDS list") };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function AdminTdsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const t = await getT();
  const { formatDate } = await getFormat();
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("tds:read:any")) redirect("/unauthorized");

  const params = await searchParams;
  const from = params["from"] && DATE_RE.test(params["from"]) ? params["from"] : undefined;
  const to = params["to"] && DATE_RE.test(params["to"]) ? params["to"] : undefined;

  const [{ items, nextCursor }, totals] = await Promise.all([
    listTdsRecords({ from, to, cursor: params["cursor"] }),
    sumTds({ from, to }),
  ]);

  // Shortcuts for the current and the previous Indian financial year (1 Apr to 31 Mar).
  const currentFyStart = Number(getFinancialYear().slice(0, 4));
  const fyLinks = [currentFyStart, currentFyStart - 1].map((startYear) => {
    const days = financialYearDays(startYear);
    return {
      label: `FY ${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`,
      href: `/admin/tds?from=${days.from}&to=${days.to}` as Route,
      active: from === days.from && to === days.to,
    };
  });

  const exportParams = new URLSearchParams();
  if (from) exportParams.set("from", from);
  if (to) exportParams.set("to", to);
  const exportHref = `/api/admin/tds/export${exportParams.size ? `?${exportParams}` : ""}`;
  const filtered = Boolean(from || to);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>{t("TDS list")}</h1>
          <p className="text-muted-foreground">
            {t("Tax deducted on member payouts, from the payouts marked as paid.")}
          </p>
        </div>
        {session.permissions.has("tds_report:export") ? (
          <Button
            variant="outline"
            nativeButton={false}
            render={
              <a href={exportHref} download>
                <Download />
                {t("Download CSV")}
              </a>
            }
          />
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={Percent}
          label={t("TDS deducted")}
          value={formatPaise(totals.tds.toString())}
          sublabel={filtered ? t("In the selected dates") : t("All time")}
        />
        <StatCard
          icon={Wallet}
          label={t("Gross payouts")}
          value={formatPaise(totals.gross.toString())}
          sublabel={t("Net paid {amount}", { amount: formatPaise(totals.net.toString()) })}
        />
        <StatCard
          icon={Receipt}
          label={t("Payouts paid")}
          value={totals.count.toLocaleString()}
          sublabel={filtered ? t("In the selected dates") : t("All time")}
        />
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3" role="search">
        <div className="space-y-1">
          <label htmlFor="tds-from" className="text-xs font-medium">
            {t("Paid from")}
          </label>
          <Input id="tds-from" name="from" type="date" defaultValue={from} className="w-40" />
        </div>
        <div className="space-y-1">
          <label htmlFor="tds-to" className="text-xs font-medium">
            {t("Paid to")}
          </label>
          <Input id="tds-to" name="to" type="date" defaultValue={to} className="w-40" />
        </div>
        <Button type="submit">{t("Apply")}</Button>
        {fyLinks.map((fy) => (
          <Button
            key={fy.label}
            variant={fy.active ? "default" : "outline"}
            nativeButton={false}
            render={<Link href={fy.href}>{fy.label}</Link>}
          />
        ))}
        {filtered ? (
          <Button
            variant="ghost"
            nativeButton={false}
            render={<Link href={"/admin/tds" as Route}>{t("Clear")}</Link>}
          />
        ) : null}
      </form>

      {items.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title={filtered ? t("No paid payouts in these dates") : t("No paid payouts yet")}
          description={t(
            "TDS appears here once a payout is marked as paid with the TDS amount recorded.",
          )}
        />
      ) : (
        <div className="surface-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Paid on")}</TableHead>
                <TableHead>{t("Member")}</TableHead>
                <TableHead>{t("PAN")}</TableHead>
                <TableHead className="text-right">{t("Gross")}</TableHead>
                <TableHead className="text-right">{t("TDS")}</TableHead>
                <TableHead className="text-right">{t("Net paid")}</TableHead>
                <TableHead>{t("Reference")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => {
                const requester = row.payoutRequest.requester;
                const pan = requester.memberProfile?.pan;
                return (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap">
                      {row.paidAt ? formatDate(row.paidAt) : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{requester.fullName ?? requester.email}</div>
                      <div className="text-muted-foreground text-xs">
                        {requester.memberProfile?.memberId ?? requester.email}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {pan ? (
                        maskPan(pan)
                      ) : (
                        <span className="text-destructive font-sans">{t("Missing")}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPaise(row.payoutRequest.amount.toString())}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatPaise(row.tdsDeducted.toString())}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatPaise(row.netAmount.toString())}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {row.transferReference ?? "—"}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <CursorPagination nextCursor={nextCursor} />
    </div>
  );
}
