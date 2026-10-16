import { NextResponse } from "next/server";
import { expireSubscriptions } from "@/server/domain/subscription/subscription-service";
import { expireFreshEpins } from "@/server/domain/epin/epin-service";
import { logger } from "@/server/lib/logger";
import { isAuthorizedCronRequest } from "@/server/lib/cron-auth";

/**
 * Moves things whose end date has passed to their expired state: active subscriptions and fresh
 * e-pins. Nothing else changes them, so without this run they would stay active for ever. Same
 * authentication as the other cron routes (docs/environment.md).
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const [subscriptions, epins] = await Promise.all([expireSubscriptions(), expireFreshEpins()]);
    return NextResponse.json({ subscriptions, epins });
  } catch (error) {
    logger.error("expire_stale_cron_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
