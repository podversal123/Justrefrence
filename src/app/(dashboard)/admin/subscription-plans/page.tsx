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

export const metadata: Metadata = { title: "Subscription plans" };

const TYPE_LABELS: Record<string, string> = {
  YEARLY: "Yearly",
  TIME_BOUND: "Time-bound",
  LIFETIME: "Lifetime",
};

export default async function SubscriptionPlansPage() {
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
          <h1>Subscription plans</h1>
          <p className="text-muted-foreground">
            Pricing, duration, and type are configured here — e-pin generation depends on at
            least one active plan.
          </p>
        </div>
        <CreatePlanDialog />
      </div>

      {plans.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No subscription plans yet"
          description="Create a plan to get started — without at least one active plan, e-pins can't be generated for members to redeem."
          action={<CreatePlanDialog />}
        />
      ) : (
        <div className="flex flex-col gap-3">
          {!hasAnyActive ? (
            <Card className="border-warning/40 bg-warning/5">
              <CardContent className="text-warning py-3 text-sm">
                No plan is currently active — e-pin generation will have nothing to select until
                you activate one.
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
                    {TYPE_LABELS[plan.type] ?? plan.type} ·{" "}
                    {formatPaise(plan.price.toString(), plan.currency)} ·{" "}
                    {plan.durationDays ? `${plan.durationDays} days` : "Lifetime"}
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
