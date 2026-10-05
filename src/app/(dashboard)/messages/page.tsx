import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MailOpen } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import {
  listInbox,
  listRecipientCandidates,
  listSent,
  listStaffInbox,
} from "@/server/repositories/support/message-repository";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ComposeForm, type Recipient } from "./compose-form";
import { MarkReadButton } from "./mark-read-button";

export const metadata: Metadata = { title: "Messages" };

type Box = "inbox" | "sent" | "team";

const personName = (p: { fullName: string | null; email: string } | null) =>
  p ? (p.fullName ?? p.email) : "Justreference team";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("message:read")) redirect("/unauthorized");

  const params = await searchParams;
  const isStaff = session.permissions.has("member:read:any");
  const canSend = session.permissions.has("message:send");
  const requested = params["box"];
  const box: Box =
    requested === "sent" ? "sent" : requested === "team" && isStaff ? "team" : "inbox";

  const [messages, candidates] = await Promise.all([
    box === "sent"
      ? listSent(session.userId)
      : box === "team"
        ? listStaffInbox()
        : listInbox(session.userId),
    isStaff && canSend ? listRecipientCandidates() : Promise.resolve(null),
  ]);

  const recipients: Recipient[] | null = candidates
    ? candidates.map((c) => ({
        id: c.id,
        label: `${c.vendorProfile?.businessName ?? c.fullName ?? c.email}${c.vendorProfile ? " (vendor)" : ""} — ${c.email}`,
      }))
    : null;
  const preselected = params["to"];

  const tabs: { key: Box; label: string }[] = [
    { key: "inbox", label: "Inbox" },
    ...(isStaff ? [{ key: "team" as const, label: "Team inbox" }] : []),
    { key: "sent", label: "Sent" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1>Messages</h1>
        <p className="text-muted-foreground">
          {isStaff
            ? "Write to members and vendors, and read what they send the team."
            : "Write to the Justreference team and read their replies."}
        </p>
      </div>

      {canSend ? (
        <Card>
          <CardHeader>
            <CardTitle>New message</CardTitle>
          </CardHeader>
          <CardContent>
            <ComposeForm recipients={recipients} defaultRecipientId={preselected} />
          </CardContent>
        </Card>
      ) : null}

      <nav aria-label="Message folders" className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <Link
            key={tab.key}
            href={`/messages?box=${tab.key}` as Route}
            aria-current={tab.key === box ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              tab.key === box
                ? "border-primary text-foreground"
                : "text-muted-foreground hover:text-foreground border-transparent",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {messages.length === 0 ? (
        <EmptyState
          icon={MailOpen}
          title={box === "sent" ? "Nothing sent yet" : "No messages"}
          description={
            box === "sent"
              ? "Messages you send will be listed here."
              : "Messages addressed to you will appear here."
          }
        />
      ) : (
        <ul className="flex flex-col gap-2">
          {messages.map((message) => {
            const unread = box !== "sent" && !message.readAt;
            return (
              <li key={message.id}>
                <details className="bg-card rounded-lg border">
                  <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <span className="flex min-w-0 items-center gap-2">
                      {unread ? <Badge>New</Badge> : null}
                      <span className={cn("truncate text-sm", unread && "font-semibold")}>
                        {message.subject}
                      </span>
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {box === "sent"
                        ? `To ${message.toStaff ? "Justreference team" : personName(message.to)}`
                        : `From ${personName(message.from)}`}{" "}
                      · {formatDateTime(message.createdAt)}
                    </span>
                  </summary>
                  <div className="space-y-3 border-t px-4 py-3">
                    <p className="text-sm whitespace-pre-wrap">{message.body}</p>
                    {unread ? <MarkReadButton messageId={message.id} /> : null}
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
