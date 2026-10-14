import { getT } from "@/i18n/server";
import type { Route } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { catalogImagePublicUrlClient } from "@/lib/catalog-image-url";
import { listShowingAds } from "@/server/repositories/ads/ad-repository";

/**
 * The "Sponsored" section on the home page: vendors' approved ads. If there are none (or the lookup
 * fails) nothing is shown, so the page never advertises an empty section.
 */
export async function SponsoredStrip() {
  const t = await getT();
  let ads: Awaited<ReturnType<typeof listShowingAds>> = [];
  try {
    ads = await listShowingAds();
  } catch (error) {
    console.error("[home] failed to load ads", error);
  }
  if (ads.length === 0) return null;

  return (
    <section aria-labelledby="sponsored-heading" className="mx-auto w-full max-w-7xl px-4 pt-20">
      <div className="mb-6 flex items-end justify-between gap-4">
        <h2 id="sponsored-heading" className="font-display text-2xl font-bold tracking-tight">
          {t("Sponsored")}
        </h2>
        <p className="text-muted-foreground text-xs">{t("Ads from our vendors")}</p>
      </div>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {ads.map((ad) => {
          const external = ad.ctaHref.startsWith("https://");
          const button = (
            <span className={buttonVariants({ size: "sm", variant: "outline" })}>
              {ad.ctaLabel}
              <ArrowUpRight />
            </span>
          );
          return (
            <li key={ad.id} className="surface-card flex flex-col overflow-hidden">
              <div className="bg-muted relative aspect-[16/10]">
                <Image
                  src={catalogImagePublicUrlClient(ad.imagePath)}
                  alt=""
                  fill
                  sizes="(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw"
                  className="object-cover"
                />
                <span className="bg-background/90 absolute top-2 left-2 rounded px-1.5 py-0.5 text-[10px] font-medium">
                  {t("Ad")}
                </span>
              </div>
              <div className="flex flex-1 flex-col gap-1 p-4">
                <p className="text-muted-foreground text-xs">{ad.vendor.businessName}</p>
                <p className="font-semibold">{ad.headline}</p>
                {ad.subline ? <p className="text-muted-foreground text-sm">{ad.subline}</p> : null}
                <div className="mt-auto pt-3">
                  {external ? (
                    <a href={ad.ctaHref} target="_blank" rel="noopener noreferrer sponsored">
                      {button}
                    </a>
                  ) : (
                    <Link href={ad.ctaHref as Route}>{button}</Link>
                  )}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
