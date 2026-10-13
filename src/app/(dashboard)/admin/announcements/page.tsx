import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Megaphone } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { listAllAnnouncements } from "@/server/repositories/content/announcement-repository";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { AUDIENCE_LABELS } from "@/lib/schemas/announcement";
import { AnnouncementDialog } from "./announcement-dialog";
import { AnnouncementRowActions } from "./announcement-row-actions";

export const metadata: Metadata = { title: "Announcements" };

export default async function AnnouncementsPage() {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("announcement:manage")) redirect("/unauthorized");

  const canPublish = session.permissions.has("change:review");
  const isSuper = session.permissions.has("change:apply_direct");
  const visible = (await listAllAnnouncements()).filter((a) => a.status !== "ARCHIVED");

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>Announcements</h1>
          <p className="text-muted-foreground">
            Notices shown at the top of customers&apos; and vendors&apos; dashboards.
            {isSuper ? "" : " A Super Admin publishes what you send."}
          </p>
        </div>
        <AnnouncementDialog needsApproval={!isSuper} />
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title="No announcements yet"
          description="Write one to tell members about a change, a holiday or an offer."
        />
      ) : (
        <ul className="space-y-3">
          {visible.map((a) => (
            <li
              key={a.id}
              className="surface-card flex flex-col gap-3 p-4 sm:flex-row sm:items-start"
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge status={a.status} />
                  <span className="text-muted-foreground text-xs">
                    {AUDIENCE_LABELS[a.audience]}
                  </span>
                </div>
                <p className="font-semibold">{a.title}</p>
                <p className="text-muted-foreground text-sm whitespace-pre-line">{a.body}</p>
              </div>
              <AnnouncementRowActions
                id={a.id}
                title={a.title}
                status={a.status}
                canPublish={canPublish}
                canTakeDown={isSuper}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
