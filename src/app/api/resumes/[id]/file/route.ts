import { NextResponse } from "next/server";
import { getAuthSession } from "@/server/auth/session";
import { getResumeSignedUrl } from "@/server/lib/resume-storage";
import { getResumeForDownload } from "@/server/repositories/careers/resume-repository";
import { recordAudit } from "@/server/domain/audit/record";

/**
 * Opens a résumé. Only staff with `career:manage` get a link. It is a signed URL that expires in minutes
 * and makes the browser download the file. Every opening is written to the audit log.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  // Everyone without the permission gets the same "not found", so the existence of résumés is not revealed.
  if (!session || session.status === "BLOCKED" || !session.permissions.has("career:manage")) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  const row = await getResumeForDownload(id);
  if (!row) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await recordAudit({
    actorId: session.userId,
    action: "RESUME_VIEWED",
    entityType: "resume_submissions",
    entityId: row.id,
    after: { position: row.position },
  });

  const url = await getResumeSignedUrl(row.storagePath, row.fileName);
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
}
