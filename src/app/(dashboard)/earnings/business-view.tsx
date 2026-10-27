import Link from "next/link";
import type { Route } from "next";
import { Briefcase, Search, Users, UserRound, Wallet } from "lucide-react";
import { getT } from "@/i18n/server";
import { MEMBER_ID_PATTERN } from "@/server/domain/identity/member-id";
import {
  getBusinessTotals,
  getMemberBusiness,
  getMonthlyBusiness,
} from "@/server/repositories/commerce/business-repository";
import { BusinessMonthlyChart, BusinessSplitChart } from "@/components/dashboard/member-charts";
import { StatCard } from "@/components/dashboard/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatPaise } from "@/lib/money";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const rupees = (paise: bigint) => Number(paise) / 100;

/**
 * Earnings, Business tab: how much business the member did themselves, how much their referrals did,
 * the total, and a search for one person in their network by Member ID.
 */
export async function BusinessView({
  userId,
  referralPath,
  params,
}: {
  userId: string;
  referralPath: string;
  params: Record<string, string | undefined>;
}) {
  const t = await getT();
  const from = params["from"] && DATE_RE.test(params["from"]) ? params["from"] : undefined;
  const to = params["to"] && DATE_RE.test(params["to"]) ? params["to"] : undefined;
  const searched = params["memberId"]?.trim() || undefined;
  const validSearch = searched !== undefined && MEMBER_ID_PATTERN.test(searched);

  const [totals, monthly, found] = await Promise.all([
    getBusinessTotals(userId, referralPath, { from, to }),
    getMonthlyBusiness(userId, referralPath),
    validSearch ? getMemberBusiness(userId, referralPath, searched, { from, to }) : null,
  ]);

  const referral = totals.direct + totals.indirect;
  const filtered = Boolean(from || to);
  const period = filtered ? t("In the selected dates") : t("All time");

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={UserRound}
          label={t("My business")}
          value={formatPaise(totals.own.toString())}
          sublabel={t("What you bought")}
        />
        <StatCard
          icon={Users}
          label={t("Referral business")}
          value={formatPaise(referral.toString())}
          sublabel={t("Direct {direct} · Indirect {indirect}", {
            direct: formatPaise(totals.direct.toString()),
            indirect: formatPaise(totals.indirect.toString()),
          })}
        />
        <StatCard
          icon={Briefcase}
          label={t("Total business")}
          value={formatPaise((totals.own + referral).toString())}
          sublabel={period}
          tone="success"
        />
        <StatCard
          icon={Wallet}
          label={t("Orders counted")}
          value={totals.orders.toLocaleString()}
          sublabel={t("Paid orders only")}
        />
      </div>

      <form
        id="business-search"
        method="get"
        className="flex scroll-mt-20 flex-wrap items-end gap-3"
        role="search"
      >
        <input type="hidden" name="tab" value="business" />
        <div className="space-y-1">
          <label htmlFor="biz-from" className="text-xs font-medium">
            {t("From")}
          </label>
          <Input id="biz-from" name="from" type="date" defaultValue={from} className="w-40" />
        </div>
        <div className="space-y-1">
          <label htmlFor="biz-to" className="text-xs font-medium">
            {t("To")}
          </label>
          <Input id="biz-to" name="to" type="date" defaultValue={to} className="w-40" />
        </div>
        <div className="space-y-1">
          <label htmlFor="biz-member" className="text-xs font-medium">
            {t("Search by Member ID")}
          </label>
          <Input
            id="biz-member"
            name="memberId"
            inputMode="numeric"
            maxLength={10}
            placeholder="1234567890"
            defaultValue={searched}
            className="w-44"
          />
        </div>
        <Button type="submit">
          <Search />
          {t("Search")}
        </Button>
        {filtered || searched ? (
          <Button
            variant="ghost"
            nativeButton={false}
            render={<Link href={"/earnings?tab=business" as Route}>{t("Clear")}</Link>}
          />
        ) : null}
      </form>

      {searched ? (
        <Card>
          <CardContent className="p-4">
            {!validSearch ? (
              <p className="text-sm">{t("A Member ID is 10 digits.")}</p>
            ) : found ? (
              <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
                <div>
                  <dt className="text-muted-foreground">{t("Member")}</dt>
                  <dd className="font-medium">{found.name ?? "—"}</dd>
                  <dd className="text-muted-foreground font-mono text-xs">{found.memberId}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("Where they are")}</dt>
                  <dd className="font-medium">
                    {found.level === 0
                      ? t("You")
                      : found.level === 1
                        ? t("Direct referral")
                        : t("Indirect (level {level})", { level: String(found.level) })}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("Business")}</dt>
                  <dd className="font-medium tabular-nums">
                    {formatPaise(found.business.toString())}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t("Orders")}</dt>
                  <dd className="font-medium tabular-nums">{found.orders.toLocaleString()}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm">
                {t(
                  "That Member ID is not in your network. You can only search yourself and the people who joined through you.",
                )}
              </p>
            )}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <BusinessMonthlyChart
            data={monthly.map((m) => ({
              month: m.month,
              own: rupees(m.own),
              referral: rupees(m.referral),
            }))}
          />
        </div>
        <BusinessSplitChart
          own={rupees(totals.own)}
          direct={rupees(totals.direct)}
          indirect={rupees(totals.indirect)}
        />
      </div>
    </div>
  );
}
