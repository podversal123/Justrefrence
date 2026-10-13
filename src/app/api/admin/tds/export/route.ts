import { NextResponse } from "next/server";
import { authorize } from "@/server/auth/authorize";
import {
  TDS_EXPORT_MAX_ROWS,
  listTdsRecordsForExport,
} from "@/server/repositories/tax/tds-repository";
import { toCsv } from "@/server/domain/dashboard/csv-export";
import { recordAudit } from "@/server/domain/audit/record";
import { paiseToFixedRupees } from "@/lib/money";

/**
 * TDS report download. Holds the full PAN (a TDS return needs it), so it is gated by the
 * dedicated `tds_report:export` permission and every download is written to the audit log.
 */
export async function GET(request: Request) {
  let session;
  try {
    session = await authorize("tds_report:export");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const params = new URL(request.url).searchParams;
  const filter = { from: params.get("from") ?? undefined, to: params.get("to") ?? undefined };
  const { rows, truncated } = await listTdsRecordsForExport(filter);

  const csv = toCsv(
    [
      "Paid on",
      "Member ID",
      "Name",
      "PAN",
      "Gross payout (INR)",
      "TDS deducted (INR)",
      "Net paid (INR)",
      "Transfer reference",
    ],
    rows.map((r) => {
      const requester = r.payoutRequest.requester;
      return [
        r.paidAt?.toISOString().slice(0, 10) ?? "",
        requester.memberProfile?.memberId ?? "",
        requester.fullName ?? requester.email,
        requester.memberProfile?.pan ?? "",
        paiseToFixedRupees(r.payoutRequest.amount),
        paiseToFixedRupees(r.tdsDeducted),
        paiseToFixedRupees(r.netAmount),
        r.transferReference ?? "",
      ];
    }),
    { neutralizeFormulas: true },
  );

  await recordAudit({
    actorId: session.userId,
    action: "TDS_REPORT_EXPORTED",
    entityType: "payout_transactions",
    entityId: session.userId,
    after: { rows: rows.length, truncated, ...filter },
  });

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="tds-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "no-store",
      ...(truncated ? { "X-Report-Truncated": `first ${TDS_EXPORT_MAX_ROWS} rows` } : {}),
    },
  });
}
