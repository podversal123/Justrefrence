/**
 * Turns an order's status and its status history into the steps shown on the tracking timeline.
 * Pure, no I/O. The happy path is Placed, Paid, Processing, Shipped, Delivered, Completed; an order
 * that was cancelled or refunded stops with a closing note instead of the remaining steps.
 */
export const TRACKING_STEPS = [
  "PLACED",
  "PAID",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
] as const;

export type TrackingStatus = (typeof TRACKING_STEPS)[number];
export type StepState = "done" | "current" | "upcoming";

export interface TrackingStep {
  status: TrackingStatus;
  state: StepState;
  /** When the order reached this step, if it ever did. */
  at: Date | null;
}

export interface TrackingEnding {
  status: "CANCELLED" | "REFUNDED";
  at: Date;
  reason: string | null;
}

export interface TrackingHistoryEntry {
  toStatus: string;
  createdAt: Date;
  reason: string | null;
}

export function buildTracking(
  currentStatus: string,
  history: TrackingHistoryEntry[],
): { steps: TrackingStep[]; ending: TrackingEnding | null } {
  const ordered = [...history].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  const reachedAt = new Map<string, Date>();
  for (const entry of ordered) {
    if (!reachedAt.has(entry.toStatus)) reachedAt.set(entry.toStatus, entry.createdAt);
  }

  const closed = currentStatus === "CANCELLED" || currentStatus === "REFUNDED";
  if (closed) {
    // Only the steps the order actually passed through are shown, all as done.
    const steps = TRACKING_STEPS.filter((s) => reachedAt.has(s)).map(
      (status): TrackingStep => ({ status, state: "done", at: reachedAt.get(status) ?? null }),
    );
    const last = [...ordered].reverse().find((e) => e.toStatus === currentStatus);
    return {
      steps,
      ending: {
        status: currentStatus,
        at: last?.createdAt ?? reachedAt.get(currentStatus) ?? new Date(0),
        reason: last?.reason ?? null,
      },
    };
  }

  const currentIndex = TRACKING_STEPS.indexOf(currentStatus as TrackingStatus);
  const steps = TRACKING_STEPS.map((status, index): TrackingStep => {
    const at = reachedAt.get(status) ?? null;
    if (currentIndex === -1) return { status, state: "upcoming", at };
    if (index < currentIndex || (index === currentIndex && status === "COMPLETED")) {
      return { status, state: "done", at };
    }
    return { status, state: index === currentIndex ? "current" : "upcoming", at };
  });
  return { steps, ending: null };
}
