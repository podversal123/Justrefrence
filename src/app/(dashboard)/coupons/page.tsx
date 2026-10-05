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
import { formatDate } from "@/lib/format";
import { formatPaise } from "@/lib/money";

export const metadata: Metadata = { title: "My coupons" };

type Bucket = "available" | "used" | "unavailable";

export default async function MyCouponsPage() {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("coupon:redeem")) redirect("/unauthorized");

  const member = await getMemberProfileByUserId(session.userId);
  if (!member) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
        <h1>My coupons</h1>
        <EmptyState
          icon={TicketPercent}
          title="No member profile yet"
          description="Coupons are available to member accounts."
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
    { key: "available", title: "Available to use", empty: "No coupons are available right now." },
    { key: "used", title: "Used", empty: "You haven't used any coupons yet." },
    { key: "unavailable", title: "Expired or not started", empty: "Nothing here." },
  ];

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8">
      <div>
        <h1>My coupons</h1>
        <p className="text-muted-foreground">
          Enter a code at checkout to apply it. Each coupon has its own dates, minimum order and
          limits.
        </p>
      </div>

      {sections.map((section) => (
        <section key={section.key} aria-labelledby={`coupons-${section.key}`} className="space-y-3">
          <h2 id={`coupons-${section.key}`} className="text-base font-semibold">
            {section.title} ({buckets[section.key].length})
          </h2>
          {buckets[section.key].length === 0 ? (
            <p className="text-muted-foreground text-sm">{section.empty}</p>
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
                        <p className="text-sm font-medium">{describeDiscount(coupon)}</p>
                        <p className="text-muted-foreground text-xs">
                          {coupon.minOrderAmount > 0n
                            ? `On orders of ${formatPaise(coupon.minOrderAmount.toString(), "INR")} or more. `
                            : "No minimum order. "}
                          {coupon.expiresAt
                            ? `Valid until ${formatDate(coupon.expiresAt)}.`
                            : "No end date."}
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
