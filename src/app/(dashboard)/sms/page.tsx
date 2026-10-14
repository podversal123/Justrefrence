import { getFormat, getT } from "@/i18n/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MessageSquareText } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { listInbox } from "@/server/repositories/sms/sms-repository";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";
import { MarkAllReadButton, MarkReadButton } from "./mark-read-buttons";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("SMS inbox") };
}

export default async function SmsInboxPage() {
  const t = await getT();
  const { formatDateTime } = await getFormat();
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("sms:read") || !session.hasMemberProfile) redirect("/unauthorized");

  const messages = await listInbox(session.userId);
  const unread = messages.filter((m) => m.readAt === null).length;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>{t("SMS inbox")}</h1>
          <p className="text-muted-foreground">
            {t("Texts the team has sent you.")}{" "}
            {unread > 0 ? t("{count} unread.", { count: unread }) : t("You are all caught up.")}
          </p>
        </div>
        {unread > 0 ? <MarkAllReadButton /> : null}
      </div>

      {messages.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title={t("No messages yet")}
          description={t("When the team sends you an SMS, it will show here.")}
        />
      ) : (
        <ul className="space-y-3">
          {messages.map((m) => (
            <li
              key={m.id}
              className={cn(
                "surface-card space-y-2 p-4",
                m.readAt === null && "border-primary/40 bg-primary/5",
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-muted-foreground text-xs">
                  {t("From the Justreference team")} · {formatDateTime(m.createdAt)}
                </p>
                {m.readAt === null ? <MarkReadButton smsId={m.id} /> : null}
              </div>
              <p className="whitespace-pre-wrap">{m.body}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
