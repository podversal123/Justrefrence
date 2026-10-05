import type { Metadata, Route } from "next";
import Link from "next/link";
import { ArrowRight, SearchX } from "lucide-react";
import { HitThumb } from "@/components/search/hit-thumb";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import {
  MAX_QUERY_LENGTH,
  MIN_QUERY_LENGTH,
  normalizeQuery,
  searchMarketplace,
  type MarketplaceSearchResult,
  type SearchHit,
} from "@/server/domain/search/marketplace-search";
import { BRAND } from "@/lib/brand";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";

const SCOPES = [
  { key: "all", label: "All" },
  { key: "products", label: "Products" },
  { key: "services", label: "Services" },
  { key: "projects", label: "Projects" },
] as const;
type Scope = (typeof SCOPES)[number]["key"];

const PER_KIND = 8;

export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}): Promise<Metadata> {
  const query = normalizeQuery((await searchParams)["q"]);
  return {
    title: query ? `Search results for "${query}"` : "Search",
    // Search result pages shouldn't be indexed (infinite near-duplicate URLs).
    robots: { index: false, follow: true },
  };
}

function Group({
  title,
  segment,
  query,
  hits,
}: {
  title: string;
  segment: "products" | "services" | "projects";
  query: string;
  hits: SearchHit[];
}) {
  if (hits.length === 0) return null;
  return (
    <section aria-labelledby={`g-${segment}`} className="space-y-3">
      <div className="flex items-end justify-between gap-4">
        <h2 id={`g-${segment}`} className="text-lg">
          {title}{" "}
          <span className="text-muted-foreground text-sm font-normal">
            ({hits.length}
            {hits.length === PER_KIND ? "+" : ""})
          </span>
        </h2>
        <Link
          href={`/${segment}?search=${encodeURIComponent(query)}` as Route}
          className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
        >
          See all {title.toLowerCase()}
          <ArrowRight className="size-4" />
        </Link>
      </div>
      <ul className="divide-y rounded-lg border">
        {hits.map((hit) => (
          <li key={`${hit.kind}-${hit.id}`}>
            <Link
              href={hit.href as Route}
              className="hover:bg-accent focus-visible:bg-accent flex items-center gap-4 p-3 outline-none"
            >
              <HitThumb kind={hit.kind} imagePath={hit.imagePath} alt="" size={56} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{hit.title}</span>
                <span className="text-muted-foreground block truncate text-xs">
                  {hit.categoryName} · {hit.vendorBusinessName}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">
                {hit.price === null ? "Quote on request" : formatPaise(hit.price, hit.currency)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const params = await searchParams;
  const rawQuery = params["q"] ?? "";
  const query = normalizeQuery(rawQuery);
  const scope: Scope = SCOPES.find((s) => s.key === params["scope"])?.key ?? "all";

  let result: MarketplaceSearchResult | null = null;
  let failed = false;
  if (query) {
    try {
      result = await searchMarketplace(query, { perKind: PER_KIND, categories: 6 });
    } catch (error) {
      console.error("[search] failed", error);
      failed = true;
    }
  }

  const visible = {
    products: scope === "all" || scope === "products" ? (result?.products ?? []) : [],
    services: scope === "all" || scope === "services" ? (result?.services ?? []) : [],
    projects: scope === "all" || scope === "projects" ? (result?.projects ?? []) : [],
  };
  const total = visible.products.length + visible.services.length + visible.projects.length;
  const counts = {
    all:
      (result?.products.length ?? 0) +
      (result?.services.length ?? 0) +
      (result?.projects.length ?? 0),
    products: result?.products.length ?? 0,
    services: result?.services.length ?? 0,
    projects: result?.projects.length ?? 0,
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10">
      {query ? (
        <>
          <h1 className="mb-1">Results for &ldquo;{query}&rdquo;</h1>
          <p className="text-muted-foreground mb-6 text-sm">
            {failed
              ? "Search is unavailable right now."
              : `${counts.all} listing${counts.all === 1 ? "" : "s"} found`}
          </p>

          <nav aria-label="Result type" className="mb-8 flex flex-wrap gap-2">
            {SCOPES.map((s) => (
              <Link
                key={s.key}
                href={
                  `/search?q=${encodeURIComponent(query)}${s.key === "all" ? "" : `&scope=${s.key}`}` as Route
                }
                aria-current={s.key === scope ? "page" : undefined}
                className={cn(
                  "rounded-full border px-3 py-1 text-sm",
                  s.key === scope
                    ? "bg-primary text-primary-foreground border-primary"
                    : "hover:bg-accent",
                )}
              >
                {s.label} <span className="tabular-nums opacity-70">{counts[s.key]}</span>
              </Link>
            ))}
          </nav>

          {failed ? (
            <ErrorState description="We couldn't run that search. Please try again in a moment." />
          ) : (
            <div className="space-y-10">
              {result && result.categories.length > 0 ? (
                <section aria-labelledby="g-cats" className="space-y-3">
                  <h2 id="g-cats" className="text-lg">
                    Matching categories
                  </h2>
                  <ul className="flex flex-wrap gap-2">
                    {result.categories.map((c) => (
                      <li key={`${c.kind}-${c.id}`}>
                        <Link
                          href={c.href as Route}
                          className="hover:bg-accent inline-flex rounded-full border px-3 py-1.5 text-sm"
                        >
                          {c.name}
                          <span className="text-muted-foreground ml-1.5 text-xs">
                            {c.kind === "PRODUCT" ? "Products" : "Services"}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
              ) : null}

              <Group title="Products" segment="products" query={query} hits={visible.products} />
              <Group title="Services" segment="services" query={query} hits={visible.services} />
              <Group title="Projects" segment="projects" query={query} hits={visible.projects} />

              {total === 0 && (!result || result.categories.length === 0) ? (
                <EmptyState
                  icon={SearchX}
                  title={`Nothing found for "${query}"`}
                  description="Check the spelling, try a shorter or more general word, or browse everything by category."
                  action={
                    <Link
                      href={"/products" as Route}
                      className="text-primary text-sm font-medium hover:underline"
                    >
                      Browse all products
                    </Link>
                  }
                />
              ) : null}
            </div>
          )}
        </>
      ) : (
        <>
          <h1 className="mb-2">Search</h1>
          <p className="text-muted-foreground max-w-xl">
            {rawQuery.trim().length > 0
              ? `Type at least ${MIN_QUERY_LENGTH} characters (up to ${MAX_QUERY_LENGTH}) in the search box above.`
              : "Search products, services and projects from approved vendors using the search box above."}
          </p>
          <p className="text-muted-foreground mt-6 text-sm">{BRAND.tagline}</p>
        </>
      )}
    </div>
  );
}
