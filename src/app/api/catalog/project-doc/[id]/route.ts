import { NextResponse } from "next/server";
import { getAuthSession } from "@/server/auth/session";
import { getProjectDocumentInfo } from "@/server/repositories/catalog/project-document-repository";
import { getKycSignedUrl } from "@/server/lib/kyc-storage";
import { recordAudit } from "@/server/domain/audit/record";

/**
 * Opens the document attached to a project. Only the seller who owns the project, or a team member
 * who reviews projects, gets a link, and the link expires in minutes. A team member opening a
 * seller's document is audited.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  if (!session || session.status === "BLOCKED") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const project = await getProjectDocumentInfo(id);
  const isOwner = project !== null && session.vendorProfileId === project.vendorId;
  const isReviewer = session.permissions.has("project:approve");
  if (!project?.documentPath || (!isOwner && !isReviewer)) {
    // The same answer as "not found", so it does not reveal that a document exists.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!isOwner) {
    await recordAudit({
      actorId: session.userId,
      action: "PROJECT_DOCUMENT_VIEWED",
      entityType: "projects",
      entityId: project.id,
    });
  }

  const url = await getKycSignedUrl(project.documentPath);
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
}
