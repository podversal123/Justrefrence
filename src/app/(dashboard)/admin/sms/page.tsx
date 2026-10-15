import { msg } from "@/i18n/locales";
import { getFormat, getT } from "@/i18n/server";
import type { Metadata, Route } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { MessageSquareText } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { getDraft, listDrafts, listOutbox } from "@/server/repositories/sms/sms-repository";
import {
  SMS_AUDIENCE_LABEL,
  isRecordedOnly,
  smsStateLabel,
  type SmsStatus,
} from "@/server/domain/sms/rules";
import { Badge } from "@/components/ui/badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/native-select";
import { CursorPagination } from "@/components/ui/pagination";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import { ComposeForm } from "./compose-form";
import { DeleteDraftButton } from "./draft-actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("SMS") };
}

const TABS = [
  { key: "compose", label: msg("Write") },
  { key: "drafts", label: msg("Drafts") },
  { key: "outbox", label: msg("Outbox") },
] as const;
const STATUSES: SmsStatus[] = ["SENT", "FAILED", "QUEUED"];
const STATUS_LABEL: Record<SmsStatus, string> = {
  SENT: msg("Sent or recorded"),
  FAILED: msg("Failed"),
  QUEUED: msg("Waiting"),
};

/** A text that was handed off, but only to the stand-in used while no real SMS service is connected. */
function recordedOnly(m: { status: SmsStatus; provider: string | null }) {
  return m.status === "SENT" && isRecordedOnly(m.provider);
}

export default async function AdminSmsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const t = await getT();
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("sms:send")) redirect("/unauthorized");

  const params = await searchParams;
  const tab = TABS.find((t) => t.key === params["tab"])?.key ?? "compose";
  const draftId = params["draft"];
  const draft = tab === "compose" && draftId ? await getDraft(session.userId, draftId) : null;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div>
        <h1>{t("SMS")}</h1>
        <p className="text-muted-foreground">
          {t(
            "Write a text to one member or a group, keep drafts, and see everything you have sent.",
          )}
        </p>
      </div>

      <nav aria-label={t("SMS sections")} className="flex flex-wrap gap-2">
        {TABS.map((tab_) => (
          <Link
            key={tab_.key}
            href={`/admin/sms?tab=${tab_.key}` as Route}
            aria-current={tab_.key === tab ? "page" : undefined}
            className={cn(
              buttonVariants({ variant: tab_.key === tab ? "default" : "outline", size: "sm" }),
            )}
          >
            {t(tab_.label)}
          </Link>
        ))}
      </nav>

      {tab === "compose" ? (
        <section className="space-y-4 rounded-lg border p-5" aria-label={t("Write an SMS")}>
          <p className="text-muted-foreground text-sm">
            {t(
              "Members read it in their SMS inbox. Texts go out through the SMS service; until it is connected they are only recorded, and the outbox says so.",
            )}
          </p>
          <ComposeForm
            key={draft?.id ?? "new"}
            initial={
              draft
                ? {
                    draftId: draft.id,
                    audience: draft.audience,
                    recipientEmail: draft.recipientEmail,
                    body: draft.body,
                  }
                : undefined
            }
          />
        </section>
      ) : null}

      {tab === "drafts" ? <Drafts authorId={session.userId} /> : null}
      {tab === "outbox" ? <Outbox params={params} /> : null}
    </div>
  );
}

async function Drafts({ authorId }: { authorId: string }) {
  const t = await getT();
  const { formatDateTime } = await getFormat();
  const drafts = await listDrafts(authorId);
  if (drafts.length === 0) {
    return (
      <EmptyState
        icon={MessageSquareText}
        title={t("No drafts")}
        description={t("Use Save as draft on the Write tab to finish a message later.")}
      />
    );
  }
  return (
    <ul className="space-y-3">
      {drafts.map((d) => (
        <li key={d.id} className="surface-card flex flex-wrap items-center gap-4 p-4">
          <div className="min-w-0 flex-1 space-y-1">
            <Badge variant="secondary">{t(SMS_AUDIENCE_LABEL[d.audience])}</Badge>
            <p className="line-clamp-2 text-sm">{d.body}</p>
            <p className="text-muted-foreground text-xs">
              {t("Saved {date}", { date: formatDateTime(d.updatedAt) })}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href={`/admin/sms?tab=compose&draft=${d.id}` as Route}
              className={buttonVariants({ size: "sm" })}
            >
              {t("Open and send")}
            </Link>
            <DeleteDraftButton draftId={d.id} />
          </div>
        </li>
      ))}
    </ul>
  );
}

async function Outbox({ params }: { params: Record<string, string | undefined> }) {
  const t = await getT();
  const { formatDateTime } = await getFormat();
  const status = STATUSES.find((s) => s === params["status"]);
  const search = params["search"]?.slice(0, 100);
  const { items, nextCursor } = await listOutbox({ status, search, cursor: params["cursor"] });

  return (
    <section className="space-y-4" aria-label={t("Outbox")}>
      <form method="get" role="search" className="flex flex-wrap items-end gap-3">
        <input type="hidden" name="tab" value="outbox" />
        <div className="space-y-1">
          <label htmlFor="ob-search" className="text-xs font-medium">
            {t("Search")}
          </label>
          <Input
            id="ob-search"
            name="search"
            defaultValue={search}
            placeholder={t("Words in the message, member or number")}
            className="w-72"
          />
        </div>
        <div className="space-y-1">
          <label htmlFor="ob-status" className="text-xs font-medium">
            {t("Status")}
          </label>
          <NativeSelect id="ob-status" name="status" defaultValue={status ?? ""} className="w-48">
            <option value="">{t("All")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {t(STATUS_LABEL[s])}
              </option>
            ))}
          </NativeSelect>
        </div>
        <Button type="submit">{t("Apply")}</Button>
      </form>

      {items.length === 0 ? (
        <EmptyState
          icon={MessageSquareText}
          title={t("Nothing sent yet")}
          description={t("Texts you send from the Write tab will be listed here.")}
        />
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("When")}</TableHead>
                <TableHead>{t("To")}</TableHead>
                <TableHead>{t("Message")}</TableHead>
                <TableHead>{t("Status")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-sm whitespace-nowrap">
                    {formatDateTime(m.createdAt)}
                  </TableCell>
                  <TableCell>
                    <p className="text-sm">{m.recipient.fullName ?? m.recipient.email}</p>
                    <p className="text-muted-foreground text-xs">{m.phone}</p>
                  </TableCell>
                  <TableCell className="max-w-sm text-sm">
                    <p className="line-clamp-3">{m.body}</p>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={
                        m.status === "FAILED"
                          ? "destructive"
                          : m.status === "QUEUED"
                            ? "warning"
                            : recordedOnly(m)
                              ? "secondary"
                              : "success"
                      }
                    >
                      {recordedOnly(m) ? t("Recorded only") : smsStateLabel(m)}
                    </Badge>
                    {recordedOnly(m) ? (
                      <p className="text-muted-foreground mt-1 text-xs">
                        {t("SMS service not connected")}
                      </p>
                    ) : null}
                    {m.failureReason ? (
                      <p className="text-destructive mt-1 text-xs">{m.failureReason}</p>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <CursorPagination nextCursor={nextCursor} />
        </>
      )}
    </section>
  );
}
