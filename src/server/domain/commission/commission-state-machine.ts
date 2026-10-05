/**
 * Pure commission lifecycle state machine — see
 * docs/adr/0008-explicit-state-machines.md and
 * docs/adr/0014-commission-engine.md. No I/O. The only code path allowed to
 * change `Commission.status` is assertCommissionTransition() below, called
 * from src/server/domain/commission/commission-service.ts, which writes the
 * new status AND a CommissionStatusHistory row in the same transaction —
 * never a plain `UPDATE ... SET status = ...` anywhere else.
 */
import { ConflictError } from "@/server/lib/errors";

export const COMMISSION_STATUSES = ["PENDING", "ELIGIBLE", "AVAILABLE", "REVERSED", "CANCELLED"] as const;
export type CommissionStatus = (typeof COMMISSION_STATUSES)[number];

export type CommissionActorRole = "SYSTEM" | "ADMIN" | "FINANCE";

interface TransitionRule {
  to: CommissionStatus;
  roles: CommissionActorRole[];
}

/**
 * PENDING: created at order placement, one row per (order, beneficiary,
 * level) with a matching active rule.
 * ELIGIBLE: order reached COMPLETED and the eligibility predicate passed —
 * confirmed owed, still inside the release-delay window (Q-06).
 * AVAILABLE: releaseAt has passed — genuinely available (a future wallet
 * phase would credit it here).
 * CANCELLED: the order was cancelled/refunded (or eligibility failed)
 * before the commission was ever confirmed — nothing to reverse.
 * REVERSED: the order was refunded/cancelled AFTER the commission was
 * confirmed (ELIGIBLE or AVAILABLE) — Q-07's full-reversal requirement.
 */
const COMMISSION_TRANSITIONS: Record<CommissionStatus, TransitionRule[]> = {
  PENDING: [
    { to: "ELIGIBLE", roles: ["SYSTEM", "ADMIN", "FINANCE"] },
    { to: "CANCELLED", roles: ["SYSTEM", "ADMIN", "FINANCE"] },
  ],
  ELIGIBLE: [
    { to: "AVAILABLE", roles: ["SYSTEM", "ADMIN", "FINANCE"] },
    { to: "REVERSED", roles: ["SYSTEM", "ADMIN", "FINANCE"] },
    { to: "CANCELLED", roles: ["ADMIN", "FINANCE"] },
  ],
  AVAILABLE: [{ to: "REVERSED", roles: ["SYSTEM", "ADMIN", "FINANCE"] }],
  REVERSED: [],
  CANCELLED: [],
};

export function canTransitionCommission(
  from: CommissionStatus,
  to: CommissionStatus,
  actorRole: CommissionActorRole,
): boolean {
  const rule = COMMISSION_TRANSITIONS[from].find((r) => r.to === to);
  return rule !== undefined && rule.roles.includes(actorRole);
}

export function assertCommissionTransition(
  from: CommissionStatus,
  to: CommissionStatus,
  actorRole: CommissionActorRole,
): CommissionStatus {
  if (!canTransitionCommission(from, to, actorRole)) {
    throw new ConflictError(`Cannot move a commission from ${from} to ${to}.`);
  }
  return to;
}
