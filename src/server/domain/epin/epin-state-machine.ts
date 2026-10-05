/**
 * Pure e-pin status state machine — see docs/adr/0008-explicit-state-machines.md.
 * No I/O. The only code path allowed to change `Epin.status` is
 * assertEpinTransition(), called from epin-service.ts.
 */
import { ConflictError } from "@/server/lib/errors";

export const EPIN_STATUSES = ["FRESH", "USED", "EXPIRED", "REVOKED"] as const;
export type EpinStatus = (typeof EPIN_STATUSES)[number];

export type EpinActorRole = "SYSTEM" | "ADMIN" | "MEMBER";

interface TransitionRule {
  to: EpinStatus;
  roles: EpinActorRole[];
}

const EPIN_TRANSITIONS: Record<EpinStatus, TransitionRule[]> = {
  FRESH: [
    { to: "USED", roles: ["MEMBER", "SYSTEM"] },
    { to: "EXPIRED", roles: ["SYSTEM"] },
    { to: "REVOKED", roles: ["ADMIN"] },
  ],
  USED: [],
  EXPIRED: [],
  REVOKED: [],
};

export function canTransitionEpin(from: EpinStatus, to: EpinStatus, actorRole: EpinActorRole): boolean {
  const rule = EPIN_TRANSITIONS[from].find((r) => r.to === to);
  return rule !== undefined && rule.roles.includes(actorRole);
}

export function assertEpinTransition(from: EpinStatus, to: EpinStatus, actorRole: EpinActorRole): EpinStatus {
  if (!canTransitionEpin(from, to, actorRole)) {
    throw new ConflictError(`Cannot move an e-pin from ${from} to ${to}.`);
  }
  return to;
}
