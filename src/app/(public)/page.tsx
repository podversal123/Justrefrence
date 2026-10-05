import type { Metadata, Route } from "next";
import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowRight, Handshake, Package } from "lucide-react";
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
import { listClosingSoon } from "@/server/repositories/bidding/bidding-repository";
import {
  getProductCategoriesWithCounts,
  getServiceCategoriesWithCounts,
  type CategoryWithCount,
} from "@/server/repositories/marketplace-stats";
import { BRAND, HERO_SLIDES } from "@/lib/brand";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: `${BRAND.name} — ${BRAND.tagline}`,
  description: BRAND.description,
};

const FEATURED_LIMIT = 4;

/**
 * Homepage. Each data-backed section fetches and renders independently (own
 * try/catch + its own Suspense fallback), so a slow or failing query for, say,
 * projects never blocks or crashes the hero or the sections around it.
 */
export default function HomePage() {
  return (
    <>
      <HeroStage slides={HERO_SLIDES} />

      <Suspense fallback={null}>
        <LiveBidsSection />
      </Suspense>

      <Suspense fallback={<CategoriesSkeleton />}>
        <CategoryTiles kind="PRODUCT" heading="Shop by category" basePath="/products" />
      </Suspense>

      <Suspense fallback={<FeaturedGridSkeleton count={FEATURED_LIMIT} />}>
        <FeaturedSection
          kind="PRODUCT"
          heading="Featured products"
          blurb="Fresh from approved vendors."
        />
      </Suspense>

      <Suspense fallback={<FeaturedGridSkeleton count={FEATURED_LIMIT} />}>
        <FeaturedSection
          kind="SERVICE"
          heading="Popular services"
          blurb="Vetted providers, priced upfront or on request."
        />
      </Suspense>

      <Suspense fallback={<FeaturedGridSkeleton count={FEATURED_LIMIT} />}>
        <FeaturedSection
          kind="PROJECT"
          heading="Projects in motion"
          blurb="Larger engagements scoped and delivered by vendors."
        />
      </Suspense>

      <GetStartedBand />
    </>
  );
}

/* Hero: photo banner with the client's own headlines (see HeroStage). */

/* ------------------------------------------------------------------------ */

function SectionHeading({
  title,
  blurb,
  href,
  linkLabel = "View all",
  live = false,
}: {
  title: string;
  blurb?: string;
  href?: string;
  linkLabel?: string;
  live?: boolean;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="space-y-1.5">
        <h2 className="font-display flex items-center gap-3 text-3xl font-medium tracking-tight sm:text-4xl">
          {title}
          {live ? (
            <span className="bg-success/10 text-success inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 font-sans text-xs font-medium">
              <span className="bg-success size-1.5 animate-pulse rounded-full motion-reduce:animate-none" />
              Live
            </span>
          ) : null}
        </h2>
        {blurb ? <p className="text-muted-foreground max-w-xl">{blurb}</p> : null}
      </div>
      {href ? (
        <Link
          href={href as Route}
          className="text-primary inline-flex items-center gap-1 text-sm font-semibold hover:underline"
        >
          {linkLabel}
          <ArrowRight className="size-4" aria-hidden="true" />
        </Link>
      ) : null}
    </div>
  );
}

async function LiveBidsSection() {
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
    <section className="mx-auto w-full max-w-7xl px-4 pt-20">
      <SectionHeading
        title="Bids closing soon"
        blurb="Open requirements from buyers. Approved vendors can bid right now."
        href="/bids"
        linkLabel="All bids and auctions"
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
    <section className="mx-auto w-full max-w-7xl px-4 pt-20">
      <SectionHeading title={heading} href={basePath} />
      {failed ? (
        <ErrorState description="We couldn't load categories right now." />
      ) : (
        <ul className="grid grid-cols-2 gap-4 md:grid-cols-4">
          {popular.map((category) => {
            const visual = categoryVisual(category.name);
            const Icon = visual.icon;
            return (
              <li key={category.id}>
                <Link
                  href={`${basePath}?categoryId=${category.id}` as Route}
                  className="surface-card surface-lift group focus-visible:ring-ring/60 flex h-full flex-col gap-5 p-5 outline-none focus-visible:ring-3"
                >
                  <span
                    className={cn(
                      "flex size-12 items-center justify-center rounded-xl",
                      visual.tile,
                    )}
                  >
                    <Icon className="size-6" aria-hidden="true" />
                  </span>
                  <span>
                    <span className="block text-[15px] leading-snug font-semibold">
                      {category.name}
                    </span>
                    <span className="text-muted-foreground mt-0.5 flex items-center justify-between text-xs">
                      {category.itemCount} {category.itemCount === 1 ? "listing" : "listings"}
                      <ArrowRight
                        className="group-hover:text-primary size-4 transition-transform group-hover:translate-x-0.5"
                        aria-hidden="true"
                      />
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
    <section className="mx-auto w-full max-w-7xl px-4 pt-14">
      <SectionHeading title={heading} blurb={blurb} href={`/${segment}`} />
      {failed ? (
        <ErrorState description={`We couldn't load ${heading.toLowerCase()} right now.`} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={Package}
          title={`No ${heading.toLowerCase()} yet`}
          description="Check back soon as vendors add their catalog."
        />
      ) : (
        <ul className="grid grid-cols-2 gap-4 lg:grid-cols-4">
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

function GetStartedBand() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 py-24">
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="relative isolate overflow-hidden rounded-3xl p-8 text-white sm:p-10">
          <Image
            src="/images/hero/slide-5.jpg"
            alt=""
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="-z-20 object-cover"
          />
          <div
            aria-hidden="true"
            className="from-primary/95 absolute inset-0 -z-10 bg-gradient-to-br via-[oklch(0.5_0.2_22/0.9)] to-[oklch(0.35_0.18_20/0.85)]"
          />
          <div
            aria-hidden="true"
            className="bg-marigold/30 absolute -right-10 -bottom-16 size-56 rounded-full blur-3xl"
          />
          <p className="text-marigold text-sm font-medium">For vendors</p>
          <h2 className="font-display mt-2 max-w-md text-3xl font-medium tracking-tight sm:text-4xl">
            Start your own business here.
          </h2>
          <p className="mt-3 max-w-md text-white/85">
            List products, services and projects, and bid on what buyers post. Get approved once,
            sell to everyone.
          </p>
          <Link
            href={"/register" as Route}
            className={buttonVariants({
              size: "touch",
              variant: "secondary",
              className: "mt-6 px-5",
            })}
          >
            Become a vendor
            <ArrowRight />
          </Link>
        </div>
        <div className="bg-ink text-ink-foreground relative isolate overflow-hidden rounded-3xl p-8 sm:p-10">
          <Image
            src="/images/hero/slide-2.jpg"
            alt=""
            fill
            sizes="(min-width: 1024px) 50vw, 100vw"
            className="-z-20 object-cover"
          />
          <div
            aria-hidden="true"
            className="from-ink/95 via-ink/85 to-ink/70 absolute inset-0 -z-10 bg-gradient-to-br"
          />
          <div
            aria-hidden="true"
            className="bg-primary/30 absolute -top-16 -right-10 size-56 rounded-full blur-3xl"
          />
          <p className="text-marigold text-sm font-medium">Refer and earn</p>
          <h2 className="font-display mt-2 max-w-md text-3xl font-medium tracking-tight sm:text-4xl">
            Earn by introducing buyers and vendors.
          </h2>
          <p className="text-ink-foreground/80 mt-3 max-w-md">
            Introduce a buyer or a vendor. When their orders complete, a commission is recorded for
            you.
          </p>
          <Link
            href={"/referrals" as Route}
            className={buttonVariants({ size: "touch", className: "mt-6 px-5" })}
          >
            <Handshake />
            Start referring
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------ */

function CategoriesSkeleton() {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 pt-20">
      <Skeleton className="mb-8 h-9 w-60" />
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-32 rounded-xl" />
        ))}
      </div>
    </section>
  );
}

function FeaturedGridSkeleton({ count }: { count: number }) {
  return (
    <section className="mx-auto w-full max-w-7xl px-4 pt-14">
      <Skeleton className="mb-8 h-9 w-60" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: count }).map((_, i) => (
          <Skeleton key={i} className="aspect-[4/5] rounded-xl" />
        ))}
      </div>
    </section>
  );
}
