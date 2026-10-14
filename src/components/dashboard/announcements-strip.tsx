import { getT } from "@/i18n/server";
import { Megaphone } from "lucide-react";
import { listPublishedFor } from "@/server/repositories/content/announcement-repository";
import type { Panel } from "@/server/auth/panel";

/** The latest published notices from the team, shown at the top of a dashboard. Nothing when there are none. */
export async function AnnouncementsStrip({ panel }: { panel: Panel }) {
  const t = await getT();
  let items;
  try {
    items = await listPublishedFor(panel);
  } catch (error) {
    console.error("[dashboard] failed to load announcements", error);
    return null;
  }
  if (items.length === 0) return null;
  return (
    <section aria-label={t("Announcements")} className="mb-6 space-y-2">
      {items.map((a) => (
        <div key={a.id} className="bg-primary/5 border-primary/20 flex gap-3 rounded-xl border p-4">
          <Megaphone className="text-primary mt-0.5 size-5 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-semibold">{a.title}</p>
            <p className="text-muted-foreground text-sm whitespace-pre-line">{a.body}</p>
          </div>
        </div>
      ))}
    </section>
  );
}
