import type { ApprovalStatus } from "@/server/domain/catalog/types";

/**
 * Pure state-machine for listing approval — see docs/adr/0008
 * (explicit-state-machines) and docs/adr/0011 (catalog architecture). No I/O,
 * fully unit-testable. Two independent axes:
 *
 *  - approvalStatus: PENDING -> APPROVED | REJECTED, REJECTED -> PENDING
 *    (vendor edits and resubmits), APPROVED -> PENDING (a vendor's edit to
 *    an already-approved listing sends it back for re-review — see
 *    evaluateEditRequiresReapproval below).
 *  - isActive: a simple boolean toggle, vendor-controlled, independent of
 *    approval — an approved listing can be paused without losing approval.
 */

const APPROVAL_TRANSITIONS: Record<ApprovalStatus, ApprovalStatus[]> = {
  PENDING: ["APPROVED", "REJECTED"],
  REJECTED: ["PENDING"],
  APPROVED: ["PENDING"],
};

export function canTransitionApproval(from: ApprovalStatus, to: ApprovalStatus): boolean {
  return APPROVAL_TRANSITIONS[from].includes(to);
}

export function assertApprovalTransition(from: ApprovalStatus, to: ApprovalStatus): void {
  if (!canTransitionApproval(from, to)) {
    throw new Error(`Cannot move a listing from ${from} to ${to}.`);
  }
}

/**
 * A customer only ever sees a listing when both conditions hold — this is
 * the single source of truth for "is this listing publicly visible",
 * reused by both the public catalog query and any UI badge that explains
 * why a listing isn't visible yet.
 */
export function isPubliclyVisible(approvalStatus: ApprovalStatus, isActive: boolean): boolean {
  return approvalStatus === "APPROVED" && isActive;
}

/**
 * Whether a vendor's own edit to an already-APPROVED listing should reset
 * it to PENDING (protects customers from a bait-and-switch: get approved,
 * then silently change the price/description). Editing a PENDING or
 * REJECTED listing never changes its status here — it's already awaiting
 * review or the vendor is expected to resubmit explicitly.
 */
export function editRequiresReapproval(currentStatus: ApprovalStatus): boolean {
  return currentStatus === "APPROVED";
}
