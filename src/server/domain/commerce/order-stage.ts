/**
 * Which order statuses count as "running", "complete" and "cancelled" for the member panel's
 * Projects page, and as "new" and "old" for its Sale & Purchase page (workflow document, week 11).
 * Pure, no I/O. The documents give no meaning for these words beyond the order statuses the app
 * already has, so they are drawn from those: an order is running until it is completed or stopped.
 */
import type { OrderStatus } from "@/server/domain/commerce/order-state-machine";

export const PROJECT_STAGES = ["running", "complete", "cancelled"] as const;
export type ProjectStage = (typeof PROJECT_STAGES)[number];

export const SALE_STAGES = ["new", "old"] as const;
export type SaleStage = (typeof SALE_STAGES)[number];

/** Placed and not yet finished: awaiting payment, being worked on, shipped or delivered but not confirmed. */
export const RUNNING_STATUSES: readonly OrderStatus[] = [
  "PLACED",
  "PAID",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
];

const COMPLETE_STATUSES: readonly OrderStatus[] = ["COMPLETED"];
const CANCELLED_STATUSES: readonly OrderStatus[] = ["CANCELLED", "REFUNDED"];

export function statusesForProjectStage(stage: ProjectStage): readonly OrderStatus[] {
  if (stage === "running") return RUNNING_STATUSES;
  return stage === "complete" ? COMPLETE_STATUSES : CANCELLED_STATUSES;
}

/** "New" is what is still in progress; "Old" is everything that has ended, completed or not. */
export function statusesForSaleStage(stage: SaleStage): readonly OrderStatus[] {
  return stage === "new" ? RUNNING_STATUSES : [...COMPLETE_STATUSES, ...CANCELLED_STATUSES];
}
