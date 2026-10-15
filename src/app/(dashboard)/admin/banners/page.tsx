import { getT } from "@/i18n/server";
import type { Metadata } from "next";
import Image from "next/image";
import { redirect } from "next/navigation";
import { ImageIcon } from "lucide-react";
import { getAuthSession } from "@/server/auth/session";
import { listAllBanners } from "@/server/repositories/content/banner-repository";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { catalogImagePublicUrlClient } from "@/lib/catalog-image-url";
import { BannerDialog } from "./banner-dialog";
import { BannerRowActions } from "./banner-row-actions";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t("Banners") };
}

export default async function BannersPage() {
  const t = await getT();
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!session.permissions.has("banner:manage")) redirect("/unauthorized");

  const banners = await listAllBanners();
  const showing = banners.filter((b) => b.isActive).length;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1>{t("Home page banners")}</h1>
          <p className="text-muted-foreground">
            {t("The photos that change on top of the home page. They show in this order.")}
            {banners.length === 0
              ? t(" Until you add one, the standard banners are shown.")
              : showing === 0
                ? t(" None is showing right now, so the standard banners are shown.")
                : ` ${t("{count} showing.", { count: showing })}`}
          </p>
        </div>
        <BannerDialog />
      </div>

      {banners.length === 0 ? (
        <EmptyState
          icon={ImageIcon}
          title={t("No banners of your own yet")}
          description={t("The home page is using the standard banners. Add one to replace them.")}
        />
      ) : (
        <ul className="space-y-3">
          {banners.map((banner, index) => (
            <li
              key={banner.id}
              className="surface-card flex flex-col gap-4 p-4 sm:flex-row sm:items-center"
            >
              <div className="bg-muted relative aspect-[16/7] w-full shrink-0 overflow-hidden rounded-lg sm:w-56">
                <Image
                  src={catalogImagePublicUrlClient(banner.imagePath)}
                  alt=""
                  fill
                  sizes="224px"
                  className="object-cover"
                />
              </div>
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-muted-foreground text-xs tabular-nums">#{index + 1}</p>
                  <StatusBadge status={banner.isActive ? "ACTIVE" : "INACTIVE"} />
                </div>
                <p className="font-semibold">{banner.headline}</p>
                {banner.subline ? (
                  <p className="text-muted-foreground text-sm">{banner.subline}</p>
                ) : null}
                <p className="text-sm">
                  <span className="text-muted-foreground">{t("Button:")} </span>
                  {banner.ctaLabel}
                  <span className="text-muted-foreground">{t("goes to")} </span>
                  <span className="font-mono text-xs break-all">{banner.ctaHref}</span>
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:items-end">
                <BannerDialog
                  banner={{
                    id: banner.id,
                    headline: banner.headline,
                    subline: banner.subline,
                    ctaLabel: banner.ctaLabel,
                    ctaHref: banner.ctaHref,
                  }}
                />
                <BannerRowActions
                  id={banner.id}
                  headline={banner.headline}
                  isActive={banner.isActive}
                  isFirst={index === 0}
                  isLast={index === banners.length - 1}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
