import { msg } from "@/i18n/locales";
import { getFormat, getT } from "@/i18n/server";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleDollarSign, Clock, Undo2, Wallet } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import {
  getStaffCommissionTotals,
  listCommissionsForStaff,
} from "@/server/repositories/commission/commission-repository";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
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
import type { CommissionStatus } from "@/generated/prisma/enums";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Referral income") };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const STATUSES: { value: CommissionStatus; label: string }[] = [
  { value: "PENDING", label: msg("Waiting for the order to settle") },
  { value: "ELIGIBLE", label: msg("Ready to release") },
  { value: "AVAILABLE", label: msg("Paid to wallet") },
  { value: "REVERSED", label: msg("Reversed") },
  { value: "CANCELLED", label: msg("Cancelled") },
];

export default async function AdminCommissionsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const t = await getT();
  const { formatDate } = await getFormat();
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("commission:read:any")) redirect("/unauthorized");

  const params = await searchParams;
  const status = STATUSES.find((s) => s.value === params["status"])?.value;
  const search = params["search"]?.slice(0, 100);
  const from = params["from"] && DATE_RE.test(params["from"]) ? params["from"] : undefined;
  const to = params["to"] && DATE_RE.test(params["to"]) ? params["to"] : undefined;
  const filter = { search, status, from, to };

  const [{ items, nextCursor }, totals] = await Promise.all([
    listCommissionsForStaff({ ...filter, cursor: params["cursor"] }),
    getStaffCommissionTotals(filter),
  ]);
  const filtered = Boolean(search || status || from || to);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1>{t("Referral income")}</h1>
        <p className="text-muted-foreground">
          {t("What members have earned from their referrals, and where each amount stands.")}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={CircleDollarSign}
          label={t("Earned by members")}
          value={formatPaise(totals.earned.toString())}
        />
        <StatCard
          icon={Wallet}
          label={t("Paid to wallets")}
          value={formatPaise(totals.paidToWallets.toString())}
          tone="success"
        />
        <StatCard
          icon={Clock}
          label={t("Waiting to be released")}
          value={formatPaise(totals.waiting.toString())}
          tone={totals.waiting > 0n ? "warning" : "default"}
        />
        <StatCard
          icon={Undo2}
          label={t("Reversed or cancelled")}
          value={formatPaise(totals.cancelled.toString())}
        />
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3" role="search">
        <div className="space-y-1">
          <label htmlFor="ci-search" className="text-xs font-medium">
            {t("Search")}
          </label>
          <Input
            id="ci-search"
            name="search"
            defaultValue={search}
            placeholder={t("Member name, email, member ID or order")}
            className="w-72"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="ci-status" className="text-xs font-medium">
            {t("Status")}
          </label>
          <NativeSelect id="ci-status" name="status" defaultValue={status ?? ""} className="w-60">
            <option value="">{t("All")}</option>
            {STATUSES.map((s) => (
              <option key={s.value} value={s.value}>
                {t(s.label)}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <label htmlFor="ci-from" className="text-xs font-medium">
            {t("From")}
          </label>
          <Input id="ci-from" name="from" type="date" defaultValue={from} className="w-40" />
        </div>
        <div className="space-y-1">
          <label htmlFor="ci-to" className="text-xs font-medium">
            {t("To")}
          </label>
          <Input id="ci-to" name="to" type="date" defaultValue={to} className="w-40" />
        </div>
        <Button type="submit">{t("Apply")}</Button>
        {filtered ? (
          <Button
            variant="ghost"
            nativeButton={false}
            render={<Link href={"/admin/commissions" as Route}>{t("Clear")}</Link>}
          />
        ) : null}
      </form>

      {items.length === 0 ? (
        <EmptyState
          icon={Clock}
          title={t("No referral income found")}
          description={
            filtered
              ? t("Try widening the filters.")
              : t("Income appears here when a referred member completes an order.")
          }
        />
      ) : (
        <div className="surface-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Date")}</TableHead>
                <TableHead>{t("Member")}</TableHead>
                <TableHead>{t("Order")}</TableHead>
                <TableHead>{t("Type")}</TableHead>
                <TableHead>{t("Status")}</TableHead>
                <TableHead className="text-right">{t("Amount")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap">{formatDate(row.createdAt)}</TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/members/${row.beneficiary.user.id}` as Route}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {row.beneficiary.user.fullName ?? row.beneficiary.user.email}
                    </Link>
                    <p className="text-muted-foreground font-mono text-xs">
                      {row.beneficiary.memberId}
                    </p>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{row.order.orderNumber}</TableCell>
                  <TableCell>
                    {row.level === 1
                      ? t("Direct")
                      : t("Indirect (level {level})", { level: String(row.level) })}
                  </TableCell>
                  <TableCell>
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="text-right font-medium tabular-nums">
                    {formatPaise(row.amount.toString())}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <CursorPagination nextCursor={nextCursor} />
    </div>
  );
}
