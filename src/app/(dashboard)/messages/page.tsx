import { msg } from "@/i18n/locales";
import { getFormat, getT } from "@/i18n/server";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FilePen, MailOpen, Paperclip } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import {
  getDraft,
  listDrafts,
  listInbox,
  listRecipientCandidates,
  listSent,
  listStaffInbox,
} from "@/server/repositories/support/message-repository";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { ComposeForm, type Recipient } from "./compose-form";
import { MarkReadButton } from "./mark-read-button";
import { DeleteDraftButton } from "./delete-draft-button";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Messages") };
}

type Box = "inbox" | "sent" | "team" | "drafts";

const personName = (p: { fullName: string | null; email: string } | null) =>
  p ? (p.fullName ?? p.email) : "Justreference team";

export default async function MessagesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const t = await getT();
  const { formatDateTime } = await getFormat();
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("message:read")) redirect("/unauthorized");

  const params = await searchParams;
  const isStaff = session.permissions.has("member:read:any");
  const canSend = session.permissions.has("message:send");
  const requested = params["box"];
  // Drafts are for members and sellers writing to the team; staff choose a recipient every time.
  const hasDrafts = !isStaff;
  const box: Box =
    requested === "sent"
      ? "sent"
      : requested === "team" && isStaff
        ? "team"
        : requested === "drafts" && hasDrafts
          ? "drafts"
          : "inbox";
  const draftParam = params["draft"];

  const [messages, drafts, candidates, openDraft] = await Promise.all([
    box === "drafts"
      ? Promise.resolve([])
      : box === "sent"
        ? listSent(session.userId)
        : box === "team"
          ? listStaffInbox()
          : listInbox(session.userId),
    hasDrafts ? listDrafts(session.userId) : Promise.resolve([]),
    isStaff && canSend ? listRecipientCandidates() : Promise.resolve(null),
    hasDrafts && draftParam ? getDraft(session.userId, draftParam) : Promise.resolve(null),
  ]);

  const recipients: Recipient[] | null = candidates
    ? candidates.map((c) => ({
        id: c.id,
        label: `${c.vendorProfile?.businessName ?? c.fullName ?? c.email}${c.vendorProfile ? " (vendor)" : ""} · ${c.email}`,
      }))
    : null;
  const preselected = params["to"];

  const tabs: { key: Box; label: string }[] = [
    { key: "inbox", label: msg("Inbox") },
    ...(isStaff ? [{ key: "team" as const, label: msg("Team inbox") }] : []),
    { key: "sent", label: msg("Outbox") },
    ...(hasDrafts ? [{ key: "drafts" as const, label: msg("Drafts") }] : []),
  ];

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div>
        <h1>{t("Messages")}</h1>
        <p className="text-muted-foreground">
          {isStaff
            ? t("Write to members and vendors, and read what they send the team.")
            : t("Write to the Justreference team and read their replies.")}
        </p>
      </div>

      {canSend ? (
        <Card id="compose" className="scroll-mt-20">
          <CardHeader>
            <CardTitle>{openDraft ? t("Finish your draft") : t("New message")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ComposeForm
              recipients={recipients}
              defaultRecipientId={preselected}
              draft={openDraft}
            />
          </CardContent>
        </Card>
      ) : null}

      <nav aria-label={t("Message folders")} className="flex gap-1 border-b">
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
            {t(tab.label)}
            {tab.key === "drafts" && drafts.length > 0 ? ` (${drafts.length})` : ""}
          </Link>
        ))}
      </nav>

      {box === "drafts" ? (
        drafts.length === 0 ? (
          <EmptyState
            icon={FilePen}
            title={t("No drafts")}
            description={t("A message you save without sending will be kept here.")}
          />
        ) : (
          <ul className="flex flex-col gap-2">
            {drafts.map((d) => (
              <li
                key={d.id}
                className="bg-card flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{d.subject || t("(No subject)")}</p>
                  <p className="text-muted-foreground truncate text-xs">
                    {d.body.slice(0, 120) || t("(Empty)")} · {t("Saved")}{" "}
                    {formatDateTime(d.updatedAt)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Link
                    href={`/messages?draft=${d.id}` as Route}
                    className="text-primary text-sm font-medium underline-offset-4 hover:underline"
                  >
                    {t("Continue")}
                  </Link>
                  <DeleteDraftButton draftId={d.id} />
                </div>
              </li>
            ))}
          </ul>
        )
      ) : messages.length === 0 ? (
        <EmptyState
          icon={MailOpen}
          title={box === "sent" ? t("Nothing sent yet") : t("No messages")}
          description={
            box === "sent"
              ? t("Messages you send will be listed here.")
              : t("Messages addressed to you will appear here.")
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
                      {unread ? <Badge>{t("New")}</Badge> : null}
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
                    {message.attachments.length > 0 ? (
                      <ul className="space-y-1">
                        {message.attachments.map((a) => (
                          <li key={a.id}>
                            <a
                              href={`/api/messages/${a.id}/attachment`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-primary inline-flex items-center gap-1.5 text-sm font-medium underline-offset-4 hover:underline"
                            >
                              <Paperclip className="size-3.5" aria-hidden="true" />
                              {a.fileName}
                            </a>
                          </li>
                        ))}
                      </ul>
                    ) : null}
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
