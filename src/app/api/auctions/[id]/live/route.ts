import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthSession } from "@/server/auth/session";
import { auctionViewerFromSession, loadAuctionView } from "@/server/domain/auction/load-view";
import { toAuctionSnapshot } from "@/server/domain/auction/view";
import { NotFoundError, RateLimitedError } from "@/server/lib/errors";
import { defaultRateLimiter } from "@/server/lib/rate-limit";
import { jsonSuccess, toApiErrorResponse } from "@/lib/api-response";

/**
 * Live snapshot polled by the auction page every few seconds. It returns ONLY what the caller is
 * allowed to see — the same buildAuctionView() that renders the page — so a polling client can
 * never learn more than the page itself shows (never the reserve amount, never real bidder names).
 * BigInt prices travel as strings.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) throw new NotFoundError("Auction not found.");

    const session = await getAuthSession();
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const limit = await defaultRateLimiter.consume(`auctionlive:${session?.userId ?? ip}`);
    if (!limit.allowed) throw new RateLimitedError("Too many requests. Please slow down.");

    const loaded = await loadAuctionView(id, auctionViewerFromSession(session));
    if (!loaded) throw new NotFoundError("Auction not found.");
    const { auction, view, now } = loaded;

    const response = jsonSuccess(toAuctionSnapshot(auction, view, now));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return toApiErrorResponse(error) as NextResponse;
  }
}
