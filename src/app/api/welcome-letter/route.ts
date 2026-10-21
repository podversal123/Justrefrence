import { NextResponse } from "next/server";
import { getAuthSession } from "@/server/auth/session";
import { getWelcomeLetterData } from "@/server/repositories/identity/member-repository";
import { getSiteSettings } from "@/server/lib/site-settings";
import { renderWelcomeLetter } from "@/server/lib/welcome-letter-pdf";

/**
 * A member's welcome letter as a PDF. Members get their own; staff who can read members
 * (`member:read:any`) can get a member's by passing `?member=<user id>`.
 */
export async function GET(request: Request) {
  const session = await getAuthSession();
  if (!session || session.status === "BLOCKED") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const requested = new URL(request.url).searchParams.get("member");
  let userId = session.userId;
  if (requested && requested !== session.userId) {
    if (!/^[0-9a-f-]{36}$/i.test(requested) || !session.permissions.has("member:read:any")) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    userId = requested;
  }

  const [member, settings] = await Promise.all([
    getWelcomeLetterData(userId),
    getSiteSettings(),
  ]);
  if (!member?.memberId) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const pdf = await renderWelcomeLetter({
    issuedAt: member.createdAt,
    memberName: member.user.fullName?.trim() || "Member",
    membershipNumber: member.memberId,
    referralId: member.asMember?.referrer.memberId ?? null,
    email: member.user.email,
    mobile: member.user.phone,
    supportEmail: settings.contactEmail || null,
  });

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="welcome-letter.pdf"',
      "Cache-Control": "private, no-store",
    },
  });
}
