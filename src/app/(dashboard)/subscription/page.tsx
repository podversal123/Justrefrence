import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CalendarClock, Crown } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { getMemberProfileByUserId } from "@/server/repositories/identity/member-repository";
import { getActiveSubscriptionForMember, listSubscriptionsForMember } from "@/server/repositories/subscription/subscription-repository";
import { formatPaise } from "@/lib/money";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { RedeemEpinForm } from "./redeem-epin-form";

export const metadata: Metadata = { title: "My subscription" };

/** "TIME_BOUND" -> "Time bound" — same enum-display convention used elsewhere. */
function formatLabel(value: string): string {
  return value
    .split("_")
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(" ");
}

export default async function SubscriptionPage() {
  const session = await getAuthSession();
  if (!session) redirect("/login");

  const memberProfile = await getMemberProfileByUserId(session.userId).catch(() => null);

  // A user without a member profile yet (e.g. registration mid-flow) has
  // nothing to look up a subscription against — show a clean message
  // instead of crashing on a null memberId downstream.
  if (!memberProfile) {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8">
        <div>
          <h1>My subscription</h1>
        </div>
        <EmptyState
          icon={Crown}
          title="No member profile yet"
          description="Your member profile needs to be set up before you can hold a subscription. Contact support if this doesn't resolve on its own."
        />
      </div>
    );
  }

  const [activeSettled, historySettled] = await Promise.allSettled([
    getActiveSubscriptionForMember(memberProfile.id),
    listSubscriptionsForMember(memberProfile.id),
  ]);

  const activeSubscription = activeSettled.status === "fulfilled" ? activeSettled.value : null;
  const activeError = activeSettled.status === "rejected";

  const allSubscriptions = historySettled.status === "fulfilled" ? historySettled.value : [];
  const historyError = historySettled.status === "rejected";

  // Exclude the currently-active subscription from history so it isn't
  // shown twice — it already has its own section above.
  const history = allSubscriptions.filter((s) => s.id !== activeSubscription?.id);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-4 py-8">
      <div>
        <h1>My subscription</h1>
        <p className="text-muted-foreground">Your subscription status and e-pin redemption.</p>
      </div>

      <section className="rounded-xl border p-4 sm:p-5">
        <h2 className="text-base font-semibold">Current subscription</h2>
        <div className="mt-4">
          {activeError ? (
            <ErrorState title="Couldn't load your subscription" />
          ) : activeSubscription ? (
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-medium">{activeSubscription.plan.code}</p>
                <p className="text-muted-foreground text-sm">
                  {formatLabel(activeSubscription.plan.type)} ·{" "}
                  {formatPaise(activeSubscription.plan.price.toString(), activeSubscription.plan.currency)}
                </p>
                <p className="text-muted-foreground text-sm">
                  {activeSubscription.expiresAt
                    ? `Expires ${activeSubscription.expiresAt.toLocaleDateString()}`
                    : "Lifetime — never expires"}
                </p>
              </div>
              <StatusBadge status={activeSubscription.status} />
            </div>
          ) : (
            <EmptyState
              icon={Crown}
              title="No active subscription"
              description="Redeem an e-pin below to activate a subscription."
            />
          )}
        </div>
      </section>

      <section className="rounded-xl border p-4 sm:p-5">
        <h2 className="text-base font-semibold">Redeem an e-pin</h2>
        <p className="text-muted-foreground mb-4 text-sm">
          Enter the e-pin code you received to activate or renew your subscription.
        </p>
        <RedeemEpinForm />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">Subscription history</h2>
        {historyError ? (
          <ErrorState title="Couldn't load your subscription history" />
        ) : history.length === 0 ? (
          <EmptyState
            icon={CalendarClock}
            title="Nothing here yet"
            description="Past and expired subscriptions will show up here."
          />
        ) : (
          <div className="bg-surface-sunken divide-border divide-y rounded-xl border">
            {history.map((sub) => (
              <div key={sub.id} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{sub.plan.code}</p>
                  <p className="text-muted-foreground text-xs">
                    {sub.startsAt.toLocaleDateString()} –{" "}
                    {sub.expiresAt ? sub.expiresAt.toLocaleDateString() : "Lifetime"}
                  </p>
                </div>
                <StatusBadge status={sub.status} />
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
