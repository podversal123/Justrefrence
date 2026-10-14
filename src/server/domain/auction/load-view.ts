import "server-only";
import {
  getAuctionById,
  listAuctionBidRows,
} from "@/server/repositories/auction/auction-repository";
import { finalizeIfEnded } from "@/server/domain/auction/auction-service";
import { notifyAuctionEnding } from "@/server/domain/auction/notify";
import { buildAuctionView, type AuctionViewer } from "@/server/domain/auction/view";
import type { AuthSession } from "@/server/auth/session";

/** Maps a (possibly missing) session onto the viewer shape the privacy rules need. */
export function auctionViewerFromSession(session: AuthSession | null): AuctionViewer {
  return {
    userId: session?.userId ?? null,
    // auction:read:any is held only by staff roles (admin / super admin).
    isStaff: Boolean(session?.permissions.has("auction:read:any")),
  };
}

/**
 * Loads an auction and what THIS viewer is allowed to know about its bids. The first look at an
 * auction whose deadline has passed also persists it as SOLD/UNSOLD and sends the result
 * notifications, so the stored status catches up without needing a background job.
 */
export async function loadAuctionView(auctionId: string, viewer: AuctionViewer, now = new Date()) {
  let auction = await getAuctionById(auctionId);
  if (!auction) return null;
  if (auction.status === "OPEN" && auction.closesAt.getTime() <= now.getTime()) {
    const ending = await finalizeIfEnded(auctionId, now);
    if (ending) await notifyAuctionEnding(ending);
    auction = await getAuctionById(auctionId);
    if (!auction) return null;
  }
  const bids = await listAuctionBidRows(auctionId);
  const view = buildAuctionView({
    auction: {
      status: auction.status,
      startPrice: auction.startPrice,
      reservePrice: auction.reservePrice,
      minIncrement: auction.minIncrement,
      sellerUserId: auction.vendor.userId,
      winnerUserId: auction.winningBid?.bidderId ?? null,
    },
    bids,
    viewer,
    now,
  });
  return { auction, view, now };
}
