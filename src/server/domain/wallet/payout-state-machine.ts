/**
 * Pure payout-request state machine — see docs/adr/0008-explicit-state-machines.md
 * and docs/business-rules.md Q-12. No I/O. The only code path allowed to
 * change `PayoutRequest.status` is assertPayoutTransition(), called from
 * payout-service.ts, which also enforces the `approvedBy !== requestedBy`
 * second-approver rule.
 */
import { ConflictError } from "@/server/lib/errors";

export const PAYOUT_STATUSES = ["REQUESTED", "APPROVED", "REJECTED", "PROCESSING", "PAID", "FAILED"] as const;
export type PayoutStatus = (typeof PAYOUT_STATUSES)[number];

export type PayoutActorRole = "ADMIN" | "FINANCE";

interface TransitionRule {
  to: PayoutStatus;
  roles: PayoutActorRole[];
}

const PAYOUT_TRANSITIONS: Record<PayoutStatus, TransitionRule[]> = {
  REQUESTED: [
    { to: "APPROVED", roles: ["ADMIN", "FINANCE"] },
    { to: "REJECTED", roles: ["ADMIN", "FINANCE"] },
  ],
  APPROVED: [{ to: "PROCESSING", roles: ["ADMIN", "FINANCE"] }],
  PROCESSING: [
    { to: "PAID", roles: ["ADMIN", "FINANCE"] },
    { to: "FAILED", roles: ["ADMIN", "FINANCE"] },
  ],
  REJECTED: [],
  PAID: [],
  FAILED: [],
};

export function canTransitionPayout(from: PayoutStatus, to: PayoutStatus, actorRole: PayoutActorRole): boolean {
  const rule = PAYOUT_TRANSITIONS[from].find((r) => r.to === to);
  return rule !== undefined && rule.roles.includes(actorRole);
}

export function assertPayoutTransition(
  from: PayoutStatus,
  to: PayoutStatus,
  actorRole: PayoutActorRole,
): PayoutStatus {
  if (!canTransitionPayout(from, to, actorRole)) {
    throw new ConflictError(`Cannot move a payout request from ${from} to ${to}.`);
  }
  return to;
}
