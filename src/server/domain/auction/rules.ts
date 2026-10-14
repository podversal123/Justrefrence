/**
 * Forward-auction rules — pure, no I/O, unit-tested directly
 * (tests/unit/auction-rules.test.ts). A vendor sells, members bid the price
 * UP, the highest bid at closing wins. The service layer (auction-service.ts)
 * calls these inside its transactions; none of these decisions is made in
 * the browser.
 *
 * Money is integer paise (BigInt) everywhere. `total = unit price x quantity`
 * is always computed here, never accepted from a client.
 */

export type AuctionStatus = "OPEN" | "SOLD" | "UNSOLD" | "CANCELLED";

export interface AuctionLike {
  status: AuctionStatus;
  closesAt: Date;
  quantity: number;
  startPrice: bigint;
  reservePrice: bigint | null;
  minIncrement: bigint;
  autoExtendMinutes: number;
}

/** OPEN turns into ended the moment the deadline passes, whether or not it has been persisted yet. */
export function isAcceptingBids(auction: Pick<AuctionLike, "status" | "closesAt">, now: Date) {
  return auction.status === "OPEN" && now.getTime() < auction.closesAt.getTime();
}

export function hasEnded(auction: Pick<AuctionLike, "status" | "closesAt">, now: Date) {
  return auction.status === "OPEN" && now.getTime() >= auction.closesAt.getTime();
}

export function totalFor(unitPrice: bigint, quantity: number): bigint {
  return unitPrice * BigInt(quantity);
}

export function formatAuctionNumber(seq: bigint): string {
  return `AUC-${seq.toString().padStart(6, "0")}`;
}

/** The lowest unit price the next bid may be: the start price, or the top bid plus the minimum increment. */
export function minimumNextBid(
  auction: Pick<AuctionLike, "startPrice" | "minIncrement">,
  topUnitPrice: bigint | null,
): bigint {
  if (topUnitPrice === null) return auction.startPrice;
  const step = auction.minIncrement > 0n ? auction.minIncrement : 1n;
  return topUnitPrice + step;
}

export type BidViolationCode = "NOT_OPEN" | "OWN_AUCTION" | "ALREADY_LEADING" | "BID_TOO_LOW";

export interface BidViolation {
  code: BidViolationCode;
  message: string;
}

/**
 * Validates a new bid against the state the previous bid left behind.
 * Returns the first violated rule, or null when the bid is acceptable.
 */
export function checkBid(input: {
  auction: AuctionLike;
  unitPrice: bigint;
  /** Highest unit price so far, and who placed it. */
  top: { unitPrice: bigint; bidderId: string } | null;
  bidderId: string;
  isSeller: boolean;
  now: Date;
}): BidViolation | null {
  const { auction, unitPrice, top, bidderId, isSeller, now } = input;
  if (!isAcceptingBids(auction, now)) {
    return { code: "NOT_OPEN", message: "Bidding on this auction is closed." };
  }
  if (isSeller) {
    return { code: "OWN_AUCTION", message: "You can't bid on your own auction." };
  }
  if (top && top.bidderId === bidderId) {
    return {
      code: "ALREADY_LEADING",
      message: "You already have the highest bid. Wait until someone outbids you.",
    };
  }
  const minimum = minimumNextBid(auction, top?.unitPrice ?? null);
  if (unitPrice < minimum) {
    return { code: "BID_TOO_LOW", message: "Your bid is lower than the minimum allowed." };
  }
  return null;
}

/**
 * Anti-sniping: with auto-extension on, a bid placed within the last
 * `autoExtendMinutes` pushes the close to `now + autoExtendMinutes`. Never shortens.
 */
export function nextClosesAt(
  auction: Pick<AuctionLike, "closesAt" | "autoExtendMinutes">,
  now: Date,
): Date {
  if (auction.autoExtendMinutes <= 0) return auction.closesAt;
  const windowMs = auction.autoExtendMinutes * 60_000;
  const remaining = auction.closesAt.getTime() - now.getTime();
  if (remaining > windowMs) return auction.closesAt;
  const extended = new Date(now.getTime() + windowMs);
  return extended.getTime() > auction.closesAt.getTime() ? extended : auction.closesAt;
}

export type AuctionOutcome = "SOLD" | "UNSOLD";

/** What an ended auction turns into: sold to the top bidder if they reach the reserve, else unsold. */
export function decideOutcome(
  auction: Pick<AuctionLike, "reservePrice">,
  topUnitPrice: bigint | null,
): AuctionOutcome {
  if (topUnitPrice === null) return "UNSOLD";
  if (auction.reservePrice !== null && topUnitPrice < auction.reservePrice) return "UNSOLD";
  return "SOLD";
}

/** What a viewer may learn about the reserve: only whether the top bid has reached it, never the amount. */
export function reserveState(
  auction: Pick<AuctionLike, "reservePrice">,
  topUnitPrice: bigint | null,
): "NONE" | "NOT_MET" | "MET" {
  if (auction.reservePrice === null) return "NONE";
  return topUnitPrice !== null && topUnitPrice >= auction.reservePrice ? "MET" : "NOT_MET";
}

/** The winner may pay only while the auction is SOLD and no order exists yet. */
export function canClaim(auction: { status: AuctionStatus; checkoutId: string | null }): boolean {
  return auction.status === "SOLD" && auction.checkoutId === null;
}

/** A vendor may cancel before any bid, or after a sale that has not been paid for yet. */
export function canCancel(
  auction: { status: AuctionStatus; checkoutId: string | null },
  bidCount: number,
): { ok: boolean; message?: string } {
  if (auction.status === "CANCELLED")
    return { ok: false, message: "This auction is already cancelled." };
  if (auction.status === "UNSOLD") return { ok: false, message: "This auction has already ended." };
  if (auction.status === "SOLD") {
    return auction.checkoutId === null
      ? { ok: true }
      : { ok: false, message: "The winner has already paid, so it can't be cancelled." };
  }
  if (bidCount > 0) {
    return { ok: false, message: "An auction with bids can't be cancelled until it ends." };
  }
  return { ok: true };
}
