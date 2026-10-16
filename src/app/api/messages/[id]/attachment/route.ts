import { NextResponse } from "next/server";
import { getAuthSession } from "@/server/auth/session";
import { getAttachment } from "@/server/repositories/support/message-repository";
import { getMessageDocSignedUrl } from "@/server/lib/message-doc-storage";
import { recordAudit } from "@/server/domain/audit/record";

/**
 * Opens a document sent with a message. The path carries the attachment's own id. Only the person
 * who sent it, the person it was addressed to, or a team member (for messages sent to the team) get
 * a link, and the link expires in minutes. A team member opening someone's document is audited.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  if (!session || session.status === "BLOCKED") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id))
    return NextResponse.json({ error: "Not found" }, { status: 404 });

  const attachment = await getAttachment(id);
  if (!attachment) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { message } = attachment;
  const isParty = message.fromUserId === session.userId || message.toUserId === session.userId;
  const isTeam = message.toStaff && session.permissions.has("member:read:any");
  if (!isParty && !isTeam) {
    // The same answer as "not found", so it does not reveal that the document exists.
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  if (!isParty) {
    await recordAudit({
      actorId: session.userId,
      action: "MESSAGE_DOCUMENT_VIEWED",
      entityType: "message_attachments",
      entityId: attachment.id,
      after: { messageId: message.id, fromUserId: message.fromUserId },
    });
  }

  const url = await getMessageDocSignedUrl(attachment.storagePath);
  return NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "no-store" } });
}
