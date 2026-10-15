import { msg } from "@/i18n/locales";
import { getFormat, getT } from "@/i18n/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { TicketPercent } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { getMemberProfileByUserId } from "@/server/repositories/identity/member-repository";
import { listCouponsForMember } from "@/server/repositories/commerce/coupon-admin-repository";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { couponState, describeDiscount } from "@/lib/coupon-display";
import { formatPaise } from "@/lib/money";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Coupons") };
}

type Bucket = "available" | "used" | "unavailable";

export default async function MyCouponsPage() {
  const t = await getT();
  const { formatDate } = await getFormat();
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("coupon:redeem")) redirect("/unauthorized");

  const member = await getMemberProfileByUserId(session.userId);
  if (!member) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <h1>{t("Coupons")}</h1>
        <EmptyState
          icon={TicketPercent}
          title={t("No member profile yet")}
          description={t("Coupons are available to member accounts.")}
        />
      </div>
    );
  }

  const coupons = await listCouponsForMember(member.id);

  const buckets: Record<Bucket, typeof coupons> = { available: [], used: [], unavailable: [] };
  for (const coupon of coupons) {
    const state = couponState(coupon);
    const usedUp = coupon.usedByMe >= coupon.usageLimitPerMember;
    if (usedUp) buckets.used.push(coupon);
    else if (state === "ACTIVE") buckets.available.push(coupon);
    else buckets.unavailable.push(coupon);
  }

  const sections: { key: Bucket; title: string; empty: string }[] = [
    {
      key: "available",
      title: msg("Available to use"),
      empty: msg("No coupons are available right now."),
    },
    { key: "used", title: msg("Used"), empty: msg("You haven't used any coupons yet.") },
    { key: "unavailable", title: msg("Expired or not started"), empty: msg("Nothing here.") },
  ];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <div>
        <h1>{t("Coupons")}</h1>
        <p className="text-muted-foreground">
          {t(
            "Enter a code at checkout to apply it. Each coupon has its own dates, minimum order and limits.",
          )}
        </p>
      </div>

      {sections.map((section) => (
        <section key={section.key} aria-labelledby={`coupons-${section.key}`} className="space-y-3">
          <h2 id={`coupons-${section.key}`} className="text-base font-semibold">
            {t(section.title)} ({buckets[section.key].length})
          </h2>
          {buckets[section.key].length === 0 ? (
            <p className="text-muted-foreground text-sm">{t(section.empty)}</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2">
              {buckets[section.key].map((coupon) => {
                const state = couponState(coupon);
                return (
                  <li key={coupon.id}>
                    <Card className={section.key === "available" ? "" : "opacity-75"}>
                      <CardContent className="space-y-2 py-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="font-mono text-base font-semibold">{coupon.code}</p>
                          {section.key === "used" ? (
                            <StatusBadge status="USED" />
                          ) : (
                            <StatusBadge status={state} />
                          )}
                        </div>
                        <p className="text-sm font-medium">{describeDiscount(coupon, t)}</p>
                        <p className="text-muted-foreground text-xs">
                          {coupon.minOrderAmount > 0n
                            ? t("On orders of {amount} or more. ", {
                                amount: formatPaise(coupon.minOrderAmount.toString(), "INR"),
                              })
                            : t("No minimum order. ")}
                          {coupon.expiresAt
                            ? t("Valid until {date}.", { date: formatDate(coupon.expiresAt) })
                            : t("No end date.")}
                        </p>
                      </CardContent>
                    </Card>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ))}
    </div>
  );
}
