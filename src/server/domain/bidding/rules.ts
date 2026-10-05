/**
 * Bidding and reverse-auction rules — pure, no I/O, unit-tested directly
 * (tests/unit/bidding-rules.test.ts). The service layer
 * (bidding-service.ts) calls these inside its transactions; none of the
 * decisions below are ever made in the browser.
 *
 * Money is integer paise (BigInt) everywhere. `total = unit price x
 * quantity` is always computed here, never accepted from a client.
 */

export type RequirementType = "TENDER" | "REVERSE_AUCTION";
export type RequirementStatus = "OPEN" | "CLOSED" | "AWARDED" | "CANCELLED";

export interface RequirementLike {
  type: RequirementType;
  status: RequirementStatus;
  closesAt: Date;
  quantity: number;
  /** Paise per unit; reverse auctions only. */
  minDecrement: bigint;
  /** Reverse auctions only; 0 turns the extension off. */
  autoExtendMinutes: number;
  /** Optional maximum budget (paise, TOTAL) — bids above it are refused. */
  estimatedValue: bigint | null;
}

/** OPEN turns into CLOSED the moment the deadline passes, whether or not a job has persisted it yet. */
export function effectiveStatus(
  requirement: Pick<RequirementLike, "status" | "closesAt">,
  now: Date,
): RequirementStatus {
  if (requirement.status === "OPEN" && now.getTime() >= requirement.closesAt.getTime())
    return "CLOSED";
  return requirement.status;
}

export function isAcceptingBids(
  requirement: Pick<RequirementLike, "status" | "closesAt">,
  now: Date,
): boolean {
  return effectiveStatus(requirement, now) === "OPEN";
}

export function totalFor(unitPrice: bigint, quantity: number): bigint {
  return unitPrice * BigInt(quantity);
}

export function formatRequirementNumber(seq: bigint): string {
  return `REQ-${seq.toString().padStart(6, "0")}`;
}

export function formatRank(rank: number): string {
  return `L${rank}`;
}

export interface RankableBid {
  id: string;
  totalPrice: bigint;
  priceSetAt: Date;
}

/**
 * L1 is the lowest total. Equal totals are ordered by who set that price
 * first (the earlier offer ranks higher), then by id so the order is fully
 * deterministic. Rank is 1-based.
 */
export function rankBids<T extends RankableBid>(bids: T[]): (T & { rank: number })[] {
  return [...bids]
    .sort((a, b) => {
      if (a.totalPrice !== b.totalPrice) return a.totalPrice < b.totalPrice ? -1 : 1;
      const timeDiff = a.priceSetAt.getTime() - b.priceSetAt.getTime();
      if (timeDiff !== 0) return timeDiff;
      return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
    })
    .map((bid, index) => ({ ...bid, rank: index + 1 }));
}

export interface ExistingBid {
  unitPrice: bigint;
  deliveryDays: number;
}

export type BidViolationCode =
  | "NOT_OPEN"
  | "INVALID_PRICE"
  | "INVALID_DELIVERY"
  | "ABOVE_BUDGET"
  | "NO_CHANGE"
  | "PRICE_NOT_LOWER"
  | "DECREMENT_TOO_SMALL";

export interface BidViolation {
  code: BidViolationCode;
  message: string;
}

export const MIN_DELIVERY_DAYS = 1;
export const MAX_DELIVERY_DAYS = 365;

/**
 * Validates a new bid (no `existing`) or a revision (`existing` given).
 * Returns the first violated rule, or null when the bid is acceptable.
 *
 * - TENDER revisions may move the price either way until the deadline.
 * - REVERSE_AUCTION revisions may only LOWER the unit price, by at least
 *   `minDecrement`; delivery days can't be used to dodge that.
 */
export function checkBid(input: {
  requirement: RequirementLike;
  unitPrice: bigint;
  deliveryDays: number;
  existing?: ExistingBid | null;
  now: Date;
}): BidViolation | null {
  const { requirement, unitPrice, deliveryDays, existing, now } = input;

  if (!isAcceptingBids(requirement, now)) {
    return { code: "NOT_OPEN", message: "Bidding on this requirement is closed." };
  }
  if (unitPrice <= 0n) {
    return { code: "INVALID_PRICE", message: "Enter a price greater than zero." };
  }
  if (
    !Number.isInteger(deliveryDays) ||
    deliveryDays < MIN_DELIVERY_DAYS ||
    deliveryDays > MAX_DELIVERY_DAYS
  ) {
    return {
      code: "INVALID_DELIVERY",
      message: `Delivery must be between ${MIN_DELIVERY_DAYS} and ${MAX_DELIVERY_DAYS} days.`,
    };
  }
  if (
    requirement.estimatedValue !== null &&
    totalFor(unitPrice, requirement.quantity) > requirement.estimatedValue
  ) {
    return { code: "ABOVE_BUDGET", message: "Your total is above the buyer's maximum budget." };
  }

  if (existing) {
    if (existing.unitPrice === unitPrice && existing.deliveryDays === deliveryDays) {
      return { code: "NO_CHANGE", message: "That's the same as your current bid." };
    }
    if (requirement.type === "REVERSE_AUCTION") {
      if (unitPrice >= existing.unitPrice) {
        return {
          code: "PRICE_NOT_LOWER",
          message: "In a reverse auction a new bid must be lower than your current price.",
        };
      }
      if (existing.unitPrice - unitPrice < requirement.minDecrement) {
        return {
          code: "DECREMENT_TOO_SMALL",
          message: "Your price must drop by at least the minimum decrement.",
        };
      }
    }
  }
  return null;
}

/**
 * Anti-sniping: in a reverse auction with auto-extension on, a bid placed
 * within the last `extendMinutes` pushes the closing time to
 * `now + extendMinutes`. Never shortens, never applies to tenders.
 */
export function nextClosesAt(
  requirement: Pick<RequirementLike, "type" | "closesAt" | "autoExtendMinutes">,
  now: Date,
): Date {
  if (requirement.type !== "REVERSE_AUCTION" || requirement.autoExtendMinutes <= 0)
    return requirement.closesAt;
  const windowMs = requirement.autoExtendMinutes * 60_000;
  const remaining = requirement.closesAt.getTime() - now.getTime();
  if (remaining > windowMs) return requirement.closesAt;
  const extended = new Date(now.getTime() + windowMs);
  return extended.getTime() > requirement.closesAt.getTime() ? extended : requirement.closesAt;
}

/** Whether `viewer` may see the full list of bids (with prices) yet. */
export function buyerCanSeeBids(
  requirement: Pick<RequirementLike, "type" | "status" | "closesAt">,
  now: Date,
): "ALL" | "ANONYMOUS_LIVE" | "COUNT_ONLY" {
  const status = effectiveStatus(requirement, now);
  if (status !== "OPEN") return "ALL";
  return requirement.type === "REVERSE_AUCTION" ? "ANONYMOUS_LIVE" : "COUNT_ONLY";
}

export interface AwardCheck {
  ok: boolean;
  message?: string;
}

/** A requirement can be awarded only after bidding has ended and only to a bid that is still ACTIVE. */
export function canAward(
  requirement: Pick<RequirementLike, "status" | "closesAt">,
  bidStatus: "ACTIVE" | "WITHDRAWN" | "ACCEPTED" | "REJECTED",
  now: Date,
): AwardCheck {
  const status = effectiveStatus(requirement, now);
  if (status === "OPEN")
    return { ok: false, message: "Bidding is still open. You can award once it closes." };
  if (status === "AWARDED")
    return { ok: false, message: "This requirement has already been awarded." };
  if (status === "CANCELLED") return { ok: false, message: "This requirement was cancelled." };
  if (bidStatus !== "ACTIVE") return { ok: false, message: "That bid is no longer active." };
  return { ok: true };
}
