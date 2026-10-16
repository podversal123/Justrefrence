import { listPublishedFor } from "@/server/repositories/content/announcement-repository";
import { listActiveBanners } from "@/server/repositories/content/banner-repository";
import { catalogImagePublicUrlClient } from "@/lib/catalog-image-url";
import type { Panel } from "@/server/auth/panel";
import { CommunicationsTabs } from "./communications-tabs";

/**
 * What the team has sent, at the top of a dashboard: published notices, and for members and sellers
 * also the team's image offers (the banners shown on the front page). Nothing when there is none.
 * A failure to load either never breaks the dashboard; that part is just left out.
 */
export async function AnnouncementsStrip({ panel }: { panel: Panel }) {
  const [notices, banners] = await Promise.all([
    listPublishedFor(panel).catch((error) => {
      console.error("[dashboard] failed to load announcements", error);
      return [];
    }),
    // Staff manage the offers, so their own dashboard does not repeat them.
    panel === "ADMIN"
      ? Promise.resolve([])
      : listActiveBanners("DASHBOARD").catch((error) => {
          console.error("[dashboard] failed to load offers", error);
          return [];
        }),
  ]);

  return (
    <CommunicationsTabs
      notices={notices.map((n) => ({ id: n.id, title: n.title, body: n.body }))}
      offers={banners.map((b) => ({
        id: b.id,
        headline: b.headline,
        subline: b.subline,
        ctaLabel: b.ctaLabel,
        ctaHref: b.ctaHref,
        imageUrl: catalogImagePublicUrlClient(b.imagePath),
      }))}
    />
  );
}
