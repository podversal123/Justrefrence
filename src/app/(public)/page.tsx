import { getT } from "@/i18n/server";
import type { Metadata, Route } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { Package } from "lucide-react";
import { RequirementCard } from "@/components/bidding/requirement-card";
import { ListingCard } from "@/components/catalog/listing-card";
import { HeroStage } from "@/components/portal/hero-carousel";
import { categoryVisual } from "@/components/portal/category-visual";
import { buttonVariants } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { Skeleton } from "@/components/ui/skeleton";
import { getCatalogRepository } from "@/server/repositories/catalog/registry";
import {
  CATALOG_ROUTE_SEGMENTS,
  type CatalogKind,
  type CatalogListItem,
} from "@/server/domain/catalog/types";
import { SponsoredStrip } from "@/components/ads/sponsored-strip";
import { listClosingSoon } from "@/server/repositories/bidding/bidding-repository";
import {
  getMarketplaceStats,
  getProductCategoriesWithCounts,
  getServiceCategoriesWithCounts,
  type CategoryWithCount,
} from "@/server/repositories/marketplace-stats";
import { BRAND, HERO_SLIDES, type HeroSlide } from "@/lib/brand";
import { catalogImagePublicUrlClient } from "@/lib/catalog-image-url";
import { listActiveBanners } from "@/server/repositories/content/banner-repository";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return {
    title: `${BRAND.name}: ${t(BRAND.tagline)}`,
    description: t(BRAND.description),
  };
}

const FEATURED_LIMIT = 4;

/**
 * Homepage. Each data-backed section fetches and renders independently (own
 * try/catch + its own Suspense fallback), so a slow or failing query for, say,
 * projects never blocks or crashes the hero or the sections around it.
 */
/**
 * The rotating banner. Staff manage it under Admin, Banners; if none is showing (or the lookup fails)
 * the standard slides are used, so the front page is never empty.
 */
async function HomeHero() {
  let slides: readonly HeroSlide[] = HERO_SLIDES;
  try {
    const banners = await listActiveBanners("HOME");
    if (banners.length > 0) {
      slides = banners.map((b) => ({
        id: b.id,
        headline: b.headline,
        ...(b.subline ? { subline: b.subline } : {}),
        image: catalogImagePublicUrlClient(b.imagePath),
        cta: { label: b.ctaLabel, href: b.ctaHref },
      }));
    }
  } catch (error) {
    console.error("[home] failed to load banners", error);
  }
  return <HeroStage slides={slides} />;
}

export default async function HomePage() {
  const t = await getT();
  return (
    <>
      <HomeHero />

      <Suspense fallback={null}>
        <StatsStrip />
      </Suspense>

      <Suspense fallback={null}>
        <LiveBidsSection />
      </Suspense>

      <Suspense fallback={null}>
        <SponsoredStrip />
      </Suspense>

      <Suspense fallback={<CategoriesSkeleton />}>
        <CategoryTiles kind="PRODUCT" heading={t("Shop by category")} basePath="/products" />
      </Suspense>

      <Suspense fallback={<FeaturedGridSkeleton count={FEATURED_LIMIT} />}>
        <FeaturedSection
          kind="PRODUCT"
          heading={t("Featured products")}
          blurb={t("Fresh from approved vendors.")}
        />
      </Suspense>

      <Suspense fallback={<FeaturedGridSkeleton count={FEATURED_LIMIT} />}>
        <FeaturedSection
          kind="SERVICE"
          heading={t("Popular services")}
          blurb={t("Vetted providers, priced upfront or on request.")}
        />
      </Suspense>

      <Suspense fallback={<FeaturedGridSkeleton count={FEATURED_LIMIT} />}>
        <FeaturedSection
          kind="PROJECT"
          heading={t("Projects in motion")}
          blurb={t("Larger engagements scoped and delivered by vendors.")}
        />
      </Suspense>

      <GetStartedBand />
    </>
  );
}

/* Hero: photo banner with the client's own headlines (see HeroStage). */

/* ------------------------------------------------------------------------ */

async function SectionHeading({
  title,
  blurb,
  href,
  linkLabel,
  live = false,
}: {
  title: string;
  blurb?: string;
  href?: string;
  linkLabel?: string;
  live?: boolean;
}) {
  const t = await getT();
  return (
    <div className="border-ink mb-5 flex flex-wrap items-end justify-between gap-x-4 gap-y-1 border-b-2 pb-2">
      <div>
        <h2 className="flex items-center gap-3 text-2xl">
          {title}
          {live ? (
            <span className="text-success border-success/40 border px-2 py-0.5 text-xs">
              {t("Live")}
            </span>
          ) : null}
        </h2>
        {blurb ? <p className="text-muted-foreground mt-0.5 text-sm">{blurb}</p> : null}
      </div>
      {href ? (
        <Link href={href as Route} className="text-primary text-sm hover:underline">
          {linkLabel ?? t("View all")}
        </Link>
      ) : null}
    </div>
  );
}

async function LiveBidsSection() {
  const t = await getT();
  let requirements: Awaited<ReturnType<typeof listClosingSoon>> = [];
  try {
    requirements = await listClosingSoon(3);
  } catch (error) {
    console.error("[home] failed to load live bids", error);
  }
  // Nothing open: skip the section rather than advertising an empty marketplace.
  if (requirements.length === 0) return null;
  const now = new Date();

  return (
    <section className="mx-auto w-full max-w-7xl px-4 pt-10">
      <SectionHeading
        title={t("Bids closing soon")}
        blurb={t("Open requirements from buyers. Approved vendors can bid right now.")}
        href="/bids"
        linkLabel={t("All bids and auctions")}
        live
      />
      <ul className="grid gap-4 lg:grid-cols-3">
        {requirements.map((requirement) => (
          <li key={requirement.id}>
            <RequirementCard
              requirement={requirement}
              serverNow={now}
              href={`/bids/${requirement.id}`}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

async function CategoryTiles({
  kind,
  heading,
  basePath,
}: {
  kind: "PRODUCT" | "SERVICE";
  heading: string;
  basePath: "/products" | "/services";
}) {
  const t = await getT();
  let categories: CategoryWithCount[] = [];
  let failed = false;
  try {
    categories =
      kind === "PRODUCT"
        ? await getProductCategoriesWithCounts()
        : await getServiceCategoriesWithCounts();
  } catch (error) {
    console.error(`[home] failed to load ${kind} categories`, error);
    failed = true;
  }
  const popular = [...categories].sort((a, b) => b.itemCount - a.itemCount).slice(0, 8);
  if (!failed && popular.length === 0) return null;

  return (
    <section className="mx-auto w-full max-w-7xl px-4 pt-10">
      <SectionHeading title={heading} href={basePath} />
      {failed ? (
        <ErrorState description={t("We couldn't load categories right now.")} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {popular.map((category) => {
            const visual = categoryVisual(category.name);
            const Icon = visual.icon;
            return (
              <li key={category.id}>
                <Link
                  href={`${basePath}?categoryId=${category.id}` as Route}
                  className="surface-card surface-lift focus-visible:ring-ring/60 flex h-full items-center gap-3 p-3 outline-none focus-visible:ring-3"
                >
                  <span
                    className={cn("flex size-11 shrink-0 items-center justify-center", visual.tile)}
                  >
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[15px] leading-snug font-medium">
                      {category.name}
                    </span>
                    <span className="text-muted-foreground block text-xs">
                      {category.itemCount === 1
                        ? t("1 listing")
                        : t("{count} listings", { count: category.itemCount })}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

async function FeaturedSection({
  kind,
  heading,
  blurb,
}: {
  kind: CatalogKind;
  heading: string;
  blurb: string;
}) {
  const t = await getT();
  const segment = CATALOG_ROUTE_SEGMENTS[kind];
  let items: CatalogListItem[] = [];
  let failed = false;
  try {
    const result = await getCatalogRepository(kind).list(
      { sortBy: "createdAt", sortDir: "desc", limit: FEATURED_LIMIT },
      { publicOnly: true },
    );
    items = result.items;
  } catch (error) {
    console.error(`[home] failed to load featured ${kind}`, error);
    failed = true;
  }

  return (
    <section className="mx-auto w-full max-w-7xl px-4 pt-10">
      <SectionHeading title={heading} blurb={blurb} href={`/${segment}`} />
      {failed ? (
        <ErrorState description={t("We couldn't load this section right now.")} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Package}
          title={t("Nothing here yet")}
          description={t("Check back soon as vendors add their catalog.")}
        />
      ) : (
        <ul className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {items.map((item) => (
            <li key={item.id}>
              <ListingCard item={item} href={`/${segment}/${item.slug}`} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Four live counts, the way a procurement portal opens: what is on offer, at a glance. */
async function StatsStrip() {
  const t = await getT();
  let stats: Awaited<ReturnType<typeof getMarketplaceStats>> | null = null;
  try {
    stats = await getMarketplaceStats();
  } catch (error) {
    console.error("[home] failed to load marketplace stats", error);
  }
  if (!stats) return null;
  const figures = [
    { label: t("Approved vendors"), value: stats.vendors },
    { label: t("Products"), value: stats.products },
    { label: t("Services"), value: stats.services },
    { label: t("Open bids"), value: stats.bids },
  ];

  return (
    <section aria-label={t("Marketplace at a glance")} className="bg-muted border-b">
      <dl className="mx-auto grid w-full max-w-7xl grid-cols-2 px-4 sm:grid-cols-4">
        {figures.map((figure, index) => (
          <div
            key={figure.label}
            className={cn(
              "py-4 sm:px-6",
              index > 0 && "sm:border-l",
              index % 2 === 1 && "border-l",
            )}
          >
            <dd className="text-ink text-2xl font-medium tabular-nums">
              {figure.value.toLocaleString("en-IN")}
            </dd>
            <dt className="text-muted-foreground text-sm">{figure.label}</dt>
          </div>
        ))}
      </dl>
    </section>
  );
}

async function GetStartedBand() {
  const t = await getT();
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-12">
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="bg-primary text-primary-foreground p-6 sm:p-8">
          <h2 className="max-w-md text-2xl">{t("Start your own business here.")}</h2>
          <p className="mt-2 max-w-md text-white/90">
            {t(
              "List products, services and projects, and bid on what buyers post. Get approved once, sell to everyone.",
            )}
          </p>
          <Link
            href={"/become-seller" as Route}
            className={buttonVariants({
              size: "touch",
              variant: "secondary",
              className: "mt-5 px-5",
            })}
          >
            {t("Become a vendor")}
          </Link>
        </div>
        <div className="bg-ink text-ink-foreground p-6 sm:p-8">
          <h2 className="max-w-md text-2xl">{t("Earn by introducing buyers and vendors.")}</h2>
          <p className="text-ink-foreground/80 mt-2 max-w-md">
            {t(
              "Introduce a buyer or a vendor. When their orders complete, a commission is recorded for you.",
            )}
          </p>
          <Link
            href={"/referrals" as Route}
            className={buttonVariants({
              size: "touch",
              variant: "secondary",
              className: "mt-5 px-5",
            })}
          >
            {t("Start referring")}
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------ */

function CategoriesSkeleton() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 pt-10">
      <Skeleton className="mb-5 h-8 w-60" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-[4.5rem]" />
        ))}
      </div>
    </section>
  );
}

function FeaturedGridSkeleton({ count }: { count: number }) {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 pt-10">
      <Skeleton className="mb-5 h-8 w-60" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: count }).map((_, i) => (
          <Skeleton key={i} className="aspect-[4/5]" />
        ))}
      </div>
    </section>
  );
}
