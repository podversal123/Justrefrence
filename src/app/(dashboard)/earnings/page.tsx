import { getFormat, getT } from "@/i18n/server";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { CircleDollarSign, Clock, UserRound, Users, Wallet } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { getMemberProfileByUserId } from "@/server/repositories/identity/member-repository";
import {
  getEarningsTotals,
  listEarnings,
  type EarningsKind,
} from "@/server/repositories/commission/commission-repository";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { BusinessView } from "./business-view";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Earnings") };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function EarningsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const t = await getT();
  const { formatDate } = await getFormat();
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("commission:read")) redirect("/unauthorized");

  const member = await getMemberProfileByUserId(session.userId);
  if (!member) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <h1>{t("Earnings")}</h1>
        <EmptyState
          icon={CircleDollarSign}
          title={t("No member profile yet")}
          description={t("Earnings are available to member accounts.")}
        />
      </div>
    );
  }

  const params = await searchParams;
  const from = params["from"] && DATE_RE.test(params["from"]) ? params["from"] : undefined;
  const to = params["to"] && DATE_RE.test(params["to"]) ? params["to"] : undefined;
  const kind: EarningsKind | undefined =
    params["kind"] === "direct" || params["kind"] === "indirect" ? params["kind"] : undefined;

  const [totals, { items, nextCursor }] = await Promise.all([
    getEarningsTotals(member.id, { from, to }),
    listEarnings(member.id, { kind, from, to, cursor: params["cursor"] }),
  ]);

  const filtered = Boolean(from || to);
  const tabHref = (value?: EarningsKind) => {
    const q = new URLSearchParams();
    if (value) q.set("kind", value);
    if (from) q.set("from", from);
    if (to) q.set("to", to);
    return `/earnings${q.size ? `?${q}` : ""}` as Route;
  };
  const tabs: { label: string; value?: EarningsKind }[] = [
    { label: t("All"), value: undefined },
    { label: t("Direct"), value: "direct" },
    { label: t("Indirect"), value: "indirect" },
  ];
  const period = filtered ? t("In the selected dates") : t("All time");

  const header = (
    <div>
      <h1>{t("Earnings")}</h1>
      <p className="text-muted-foreground">
        {t("What you earn when people you referred, and the people they referred, buy.")}
      </p>
    </div>
  );
  const sectionTabs = (active: "commission" | "business") => (
    <div className="flex flex-wrap gap-2 border-b pb-3" aria-label={t("Earnings views")}>
      {(
        [
          { key: "commission", label: t("Commission earned"), href: "/earnings" },
          { key: "business", label: t("Business"), href: "/earnings?tab=business" },
        ] as const
      ).map((tab) => (
        <Button
          key={tab.key}
          variant={tab.key === active ? "default" : "outline"}
          size="sm"
          nativeButton={false}
          render={<Link href={tab.href as Route}>{tab.label}</Link>}
        />
      ))}
    </div>
  );

  if (params["tab"] === "business") {
    return (
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
        {header}
        {sectionTabs("business")}
        <BusinessView userId={session.userId} referralPath={member.referralPath} params={params} />
      </div>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      {header}
      {sectionTabs("commission")}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={CircleDollarSign}
          label={t("Total earnings")}
          value={formatPaise(totals.total.toString())}
          sublabel={period}
        />
        <StatCard
          icon={UserRound}
          label={t("Direct earnings")}
          value={formatPaise(totals.direct.toString())}
          sublabel={t("From people you referred")}
        />
        <StatCard
          icon={Users}
          label={t("Indirect earnings")}
          value={formatPaise(totals.indirect.toString())}
          sublabel={t("From people they referred")}
        />
        <StatCard
          icon={Wallet}
          label={t("In your wallet")}
          value={formatPaise(totals.received.toString())}
          sublabel={t("Waiting to be released: {amount}", {
            amount: formatPaise(totals.pending.toString()),
          })}
          tone="success"
        />
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3" role="search">
        {kind ? <input type="hidden" name="kind" value={kind} /> : null}
        <div className="space-y-1">
          <label htmlFor="earn-from" className="text-xs font-medium">
            {t("From")}
          </label>
          <Input id="earn-from" name="from" type="date" defaultValue={from} className="w-40" />
        </div>
        <div className="space-y-1">
          <label htmlFor="earn-to" className="text-xs font-medium">
            {t("To")}
          </label>
          <Input id="earn-to" name="to" type="date" defaultValue={to} className="w-40" />
        </div>
        <Button type="submit">{t("Apply")}</Button>
        {filtered ? (
          <Button
            variant="ghost"
            nativeButton={false}
            render={<Link href={tabHref(kind)}>{t("Clear")}</Link>}
          />
        ) : null}
      </form>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Button
            key={tab.label}
            variant={tab.value === kind ? "default" : "outline"}
            size="sm"
            nativeButton={false}
            render={<Link href={tabHref(tab.value)}>{tab.label}</Link>}
          />
        ))}
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={Clock}
          title={t("No earnings yet")}
          description={t(
            "When someone you referred completes an order, your earning shows up here.",
          )}
        />
      ) : (
        <div className="surface-card overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("Date")}</TableHead>
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
