import { msg } from "@/i18n/locales";
import { getT } from "@/i18n/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { CreditCard } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { listPlans } from "@/server/repositories/subscription/subscription-plan-repository";
import { formatPaise } from "@/lib/money";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/status-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { CreatePlanDialog } from "./create-plan-dialog";
import { PlanActiveToggle } from "./plan-active-toggle";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Subscription plans") };
}

const TYPE_LABELS: Record<string, string> = {
  YEARLY: msg("Yearly"),
  TIME_BOUND: msg("Time-bound"),
  LIFETIME: msg("Lifetime"),
};

export default async function SubscriptionPlansPage() {
  const t = await getT();
  const session = await getAuthSession();
  if (!session) redirect("/login");
  // No separate read-only permission exists for this feature in the
  // catalog — `subscription_plan:manage` gates both viewing and managing.
  if (!session.permissions.has("subscription_plan:manage")) redirect("/unauthorized");

  const plans = await listPlans(false);
  const hasAnyActive = plans.some((plan) => plan.active);

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1>{t("Subscription plans")}</h1>
          <p className="text-muted-foreground">
            {t(
              "Set the price, duration and type of each plan. E-pins can only be generated for an active plan.",
            )}
          </p>
        </div>
        <CreatePlanDialog />
      </div>

      {plans.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title={t("No subscription plans yet")}
          description={t("Create a plan first. E-pins can only be generated for an active plan.")}
          action={<CreatePlanDialog />}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {!hasAnyActive ? (
            <Card className="border-warning/40 bg-warning/5">
              <CardContent className="text-warning py-3 text-sm">
                {t("No plan is active. Activate one before you generate e-pins.")}
              </CardContent>
            </Card>
          ) : null}

          {plans.map((plan) => (
            <Card key={plan.id}>
              <CardContent className="flex flex-wrap items-center justify-between gap-4 py-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <p className="font-medium">{plan.code}</p>
                    <StatusBadge status={plan.active ? "ACTIVE" : "INACTIVE"} />
                  </div>
                  <p className="text-muted-foreground text-sm">
                    {t(TYPE_LABELS[plan.type] ?? plan.type)} ·{" "}
                    {formatPaise(plan.price.toString(), plan.currency)} ·{" "}
                    {plan.durationDays
                      ? t("{count} days", { count: plan.durationDays })
                      : t("Lifetime")}
                  </p>
                </div>
                <PlanActiveToggle planId={plan.id} active={plan.active} />
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
