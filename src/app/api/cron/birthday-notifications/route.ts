import { NextResponse } from "next/server";
import { findMembersWithBirthdayToday } from "@/server/repositories/identity/member-repository";
import { sendBirthdayNotification } from "@/server/domain/identity/notify";
import { logger } from "@/server/lib/logger";
import { isAuthorizedCronRequest } from "@/server/lib/cron-auth";

/**
 * Daily birthday-greeting scan — docs/notifications.md §5 ("Daily cron scan
 * of member_profiles.dob"). Authenticated the same way every scheduled job
 * in this codebase is documented to be (docs/environment.md): a bearer
 * token matching CRON_SECRET, set as the Authorization header by the
 * scheduler (e.g. Vercel Cron) — never a public, unauthenticated endpoint.
 */
export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const members = await findMembersWithBirthdayToday();

  let sent = 0;
  for (const member of members) {
    try {
      await sendBirthdayNotification({
        userId: member.userId,
        email: member.email,
        fullName: member.fullName ?? "there",
      });
      sent += 1;
    } catch (error) {
      logger.error("birthday_cron_send_failed", {
        userId: member.userId,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return NextResponse.json({ scanned: members.length, sent });
}
