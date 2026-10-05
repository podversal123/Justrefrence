import { NextResponse } from "next/server";
import { releaseEligibleCommissions } from "@/server/domain/commission/commission-service";
import { logger } from "@/server/lib/logger";
import { isAuthorizedCronRequest } from "@/server/lib/cron-auth";

/**
 * Promotes ELIGIBLE commissions whose release window (Q-06) has elapsed to
 * AVAILABLE. Same authentication pattern as every other cron route in this
 * codebase — see src/app/api/cron/birthday-notifications/route.ts and
 * docs/environment.md.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const released = await releaseEligibleCommissions();
    return NextResponse.json({ released });
  } catch (error) {
    logger.error("release_commissions_cron_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
