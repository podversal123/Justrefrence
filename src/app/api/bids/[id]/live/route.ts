import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthSession } from "@/server/auth/session";
import { loadRequirementView, viewerFromSession } from "@/server/domain/bidding/load-view";
import { toLiveSnapshot } from "@/server/domain/bidding/snapshot";
import { NotFoundError, RateLimitedError } from "@/server/lib/errors";
import { defaultRateLimiter } from "@/server/lib/rate-limit";
import { jsonSuccess, toApiErrorResponse } from "@/lib/api-response";

/**
 * Live snapshot polled by the auction page every few seconds. It returns ONLY
 * what the caller is allowed to see — the same buildRequirementView() that
 * renders the page — so a polling client can never learn more than the page
 * itself shows (no rival prices to a bidder, no bid ids early to the buyer).
 * BigInt prices travel as strings.
 */
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    if (!z.string().uuid().safeParse(id).success) throw new NotFoundError("Requirement not found.");

    const session = await getAuthSession();
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const limit = await defaultRateLimiter.consume(`bidlive:${session?.userId ?? ip}`);
    if (!limit.allowed) throw new RateLimitedError("Too many requests. Please slow down.");

    const loaded = await loadRequirementView(id, viewerFromSession(session));
    if (!loaded) throw new NotFoundError("Requirement not found.");
    const { requirement, view, now } = loaded;

    const response = jsonSuccess(toLiveSnapshot(requirement, view, now));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return toApiErrorResponse(error) as NextResponse;
  }
}
