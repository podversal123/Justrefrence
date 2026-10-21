// No "server-only" import — orchestration layer, same rationale as
// wallet-service.ts.
import { runInTransaction } from "@/server/repositories/transaction";
import {
  findExpiredActiveSubscriptions,
  updateSubscriptionStatus,
} from "@/server/repositories/subscription/subscription-repository";
import { recordAudit } from "@/server/domain/audit/record";

/** Cron entry point — moves ACTIVE subscriptions past their expiresAt to EXPIRED. */
export async function expireSubscriptions(now: Date = new Date()): Promise<number> {
  const due = await findExpiredActiveSubscriptions(now);
  if (due.length === 0) return 0;

  await runInTransaction(async (tx) => {
    for (const subscription of due) {
      await updateSubscriptionStatus(tx, subscription.id, "EXPIRED");
    }
  });

  for (const subscription of due) {
    await recordAudit({
      actorId: null,
      action: "SUBSCRIPTION_EXPIRED",
      entityType: "subscriptions",
      entityId: subscription.id,
    });
  }

  return due.length;
}
