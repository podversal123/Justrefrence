import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import {
  formatTicketNo,
  getTicketWithMessages,
} from "@/server/repositories/support/ticket-repository";
import { TicketHeader, TicketThread } from "@/components/support/ticket-thread";
import { TicketReplyForm, TicketStatusControls } from "@/components/support/ticket-controls";

export const metadata: Metadata = { title: "Support ticket" };

export default async function AdminTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("ticket:read:any")) redirect("/unauthorized");

  const { id } = await params;
  const ticket = await getTicketWithMessages(id).catch(() => null);
  if (!ticket) notFound();

  const canRespond = session.permissions.has("ticket:respond");
  const closed = ticket.status === "CLOSED";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href="/admin/support"
        className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" />
        All tickets
      </Link>
      <TicketHeader
        ticketLabel={formatTicketNo(ticket.ticketNo)}
        subject={ticket.subject}
        status={ticket.status}
        category={ticket.category}
        priority={ticket.priority}
        createdAt={ticket.createdAt}
        owner={ticket.user.fullName ?? ticket.user.email}
      />
      <TicketThread messages={ticket.messages} />
      {closed ? (
        <p className="text-muted-foreground text-sm">This ticket is closed.</p>
      ) : canRespond ? (
        <>
          <TicketReplyForm ticketId={ticket.id} staff />
          <TicketStatusControls
            ticketId={ticket.id}
            status={ticket.status}
            staff
            canClose={session.permissions.has("ticket:close")}
          />
        </>
      ) : null}
    </div>
  );
}
