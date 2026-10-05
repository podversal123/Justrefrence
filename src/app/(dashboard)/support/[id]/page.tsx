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

export default async function MemberTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("ticket:read")) redirect("/unauthorized");

  const { id } = await params;
  const ticket = await getTicketWithMessages(id).catch(() => null);
  // Ownership check (separate from the permission above): someone else's
  // ticket is indistinguishable from a missing one.
  if (!ticket || ticket.userId !== session.userId) notFound();

  const closed = ticket.status === "CLOSED";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <Link
        href="/support"
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
      />
      <TicketThread messages={ticket.messages} />
      {closed ? (
        <p className="text-muted-foreground text-sm">
          This ticket is closed. If the problem is back, open a new ticket from the Support page.
        </p>
      ) : (
        <>
          <TicketReplyForm ticketId={ticket.id} staff={false} />
          <TicketStatusControls
            ticketId={ticket.id}
            status={ticket.status}
            staff={false}
            canClose
          />
        </>
      )}
    </div>
  );
}
