import { NextResponse } from "next/server";
import { authorize } from "@/server/auth/authorize";
import {
  MEMBER_REPORT_MAX_ROWS,
  listMembersForReport,
} from "@/server/repositories/identity/member-admin-repository";
import { toCsv } from "@/server/domain/dashboard/csv-export";
import { recordAudit } from "@/server/domain/audit/record";
import { paiseToFixedRupees } from "@/lib/money";
import type { UserStatus } from "@/generated/prisma/enums";

const STATUSES: UserStatus[] = ["ACTIVE", "PENDING_VERIFICATION", "BLOCKED"];

/** Admin "Member Report": the members list as a CSV, honouring the same filters as the screen. */
export async function GET(request: Request) {
  let session;
  try {
    session = await authorize("member:export");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const status = STATUSES.find((s) => s === params.get("status"));
  const filter = {
    search: params.get("search") ?? undefined,
    status,
    from: params.get("from") ?? undefined,
    to: params.get("to") ?? undefined,
  };

  const { rows, truncated } = await listMembersForReport(filter);

  const csv = toCsv(
    [
      "Member ID",
      "Name",
      "Email",
      "Mobile",
      "Status",
      "KYC",
      "Joined",
      "Referred by (member ID)",
      "Business",
      "Wallet balance (INR)",
    ],
    rows.map((m) => [
      m.memberProfile?.memberId ?? "",
      m.fullName ?? "",
      m.email,
      m.phone ?? "",
      m.status,
      m.memberProfile?.kycStatus ?? "",
      m.createdAt.toISOString().slice(0, 10),
      m.memberProfile?.referredByUser?.memberProfile?.memberId ?? "",
      m.vendorProfile?.businessName ?? "",
      paiseToFixedRupees(m.wallet?.balance ?? 0n),
    ]),
    { neutralizeFormulas: true },
  );

  await recordAudit({
    actorId: session.userId,
    action: "MEMBER_REPORT_EXPORTED",
    entityType: "users",
    entityId: session.userId,
    after: { rows: rows.length, truncated, ...filter },
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="members-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
      ...(truncated ? { "X-Report-Truncated": `first ${MEMBER_REPORT_MAX_ROWS} rows` } : {}),
    },
  });
}
