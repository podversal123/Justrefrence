import { getT } from "@/i18n/server";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Megaphone } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { listAdsForVendor } from "@/server/repositories/ads/ad-repository";
import { AdDialog } from "@/components/ads/ad-dialog";
import { AdPreview } from "@/components/ads/ad-card";
import { VendorAdActions } from "@/components/ads/ad-row-actions";
import { EmptyState } from "@/components/ui/empty-state";
import { canPause } from "@/server/domain/ads/rules";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("My advertisements") };
}

export default async function VendorAdsPage() {
  const t = await getT();
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("ad:create") || !session.vendorProfileId) {
    redirect("/unauthorized");
  }

  const ads = await listAdsForVendor(session.vendorProfileId);

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>{t("My advertisements")}</h1>
          <p className="text-muted-foreground">
            {t(
              "Promote your business in the Sponsored section on the home page. The team approves each ad before it shows.",
            )}
          </p>
        </div>
        <AdDialog />
      </div>

      {ads.length === 0 ? (
        <EmptyState
          icon={Megaphone}
          title={t("You haven't added an ad yet")}
          description={t(
            "Add a photo, a headline and where the button should go. It shows after the team approves it.",
          )}
        />
      ) : (
        <ul className="space-y-3">
          {ads.map((ad) => (
            <li key={ad.id}>
              <AdPreview ad={ad}>
                <AdDialog
                  ad={{
                    id: ad.id,
                    headline: ad.headline,
                    subline: ad.subline,
                    ctaLabel: ad.ctaLabel,
                    ctaHref: ad.ctaHref,
                  }}
                />
                <VendorAdActions
                  adId={ad.id}
                  headline={ad.headline}
                  canPause={canPause(ad).ok}
                  isActive={ad.isActive}
                />
              </AdPreview>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
