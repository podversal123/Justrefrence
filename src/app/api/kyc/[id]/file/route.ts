import { NextResponse } from "next/server";
import { getAuthSession } from "@/server/auth/session";
import { getKycSignedUrl } from "@/server/lib/kyc-storage";
import { getKycDocumentForDownload } from "@/server/repositories/kyc/kyc-repository";
import { recordAudit } from "@/server/domain/audit/record";

/**
 * Opens a KYC document. Only the person it belongs to, or staff with `kyc:review`, get a link,
 * and the link is a signed URL that expires in minutes. Staff opening someone else's document is
 * written to the audit log.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  if (!session || session.status === "BLOCKED") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const doc = await getKycDocumentForDownload(id);
  if (!doc) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const isOwner = doc.ownerUserId === session.userId;
  if (!isOwner && !session.permissions.has("kyc:review")) {
    // Same answer as "not found" so the existence of other people's documents is not revealed.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!isOwner) {
    await recordAudit({
      actorId: session.userId,
      action: "KYC_DOCUMENT_VIEWED",
      entityType: "kyc_documents",
      entityId: doc.id,
      after: { type: doc.type, ownerUserId: doc.ownerUserId },
    });
  }

  const url = await getKycSignedUrl(doc.storagePath);
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
}
