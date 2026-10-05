import { NextResponse } from "next/server";
import { jsonSuccess, toApiErrorResponse } from "@/lib/api-response";
import { searchMarketplace, normalizeQuery } from "@/server/domain/search/marketplace-search";
import { RateLimitedError } from "@/server/lib/errors";
import { searchRateLimiter } from "@/server/lib/rate-limit";

/**
 * Typeahead for the header search box. Public (no sign-in), so it is:
 *  - rate limited per client IP (it fires while the visitor types),
 *  - input-bounded (2-80 chars after normalising whitespace),
 *  - read-only over APPROVED + active listings (see marketplace-search.ts).
 * Short queries return an empty result instead of an error so the UI never
 * flashes a failure while someone is still typing their first letter.
 */
const EMPTY = { query: "", products: [], services: [], projects: [], categories: [] };

export async function GET(request: Request) {
  try {
    const ip = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    const limit = await searchRateLimiter.consume(`ip:${ip}`);
    if (!limit.allowed) {
      throw new RateLimitedError("Too many searches. Please wait a moment and try again.");
    }

    const query = normalizeQuery(new URL(request.url).searchParams.get("q"));
    if (!query) return jsonSuccess(EMPTY);

    const result = await searchMarketplace(query, { perKind: 4, categories: 3 });
    const response = jsonSuccess(result);
    // Same answer for the same query for a few seconds: absorbs repeated keystrokes and back/forward.
    response.headers.set("Cache-Control", "public, max-age=15, stale-while-revalidate=30");
    return response;
  } catch (error) {
    return toApiErrorResponse(error) as NextResponse;
  }
}
