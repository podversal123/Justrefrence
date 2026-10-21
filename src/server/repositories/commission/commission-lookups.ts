// Deliberately NO "server-only" import: same exception and rationale as wallet-repository.ts. These two reads run
// inside the commission transactions, which tests exercise against a fake transaction handle.
import type { Tx } from "@/server/repositories/transaction";

/** The user who owns a member profile, read inside a transaction. */
export function findMemberUserId(tx: Tx, memberProfileId: string) {
  return tx.memberProfile.findUnique({
    where: { id: memberProfileId },
    select: { userId: true },
  });
}

/** A commission rule by id, read inside a transaction. */
export function findCommissionRuleById(tx: Tx, ruleId: string) {
  return tx.commissionRule.findUnique({ where: { id: ruleId } });
}
