import type { RequirementViewModel } from "@/server/domain/bidding/view";

/** JSON-safe live snapshot (BigInt prices as strings) shared by the polling API and the server-rendered first paint. */
export function toLiveSnapshot(
  requirement: { closesAt: Date },
  view: RequirementViewModel,
  now: Date,
) {
  return {
    status: view.status,
    closesAt: requirement.closesAt.toISOString(),
    serverNow: now.toISOString(),
    bidCount: view.bidCount,
    l1Total: view.l1Total?.toString() ?? null,
    myBid: view.myBid
      ? {
          totalPrice: view.myBid.totalPrice.toString(),
          unitPrice: view.myBid.unitPrice.toString(),
          rank: view.myBid.rank,
          status: view.myBid.status,
        }
      : null,
  };
}
