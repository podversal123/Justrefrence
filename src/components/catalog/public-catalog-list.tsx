import { msg } from "@/i18n/locales";
import { getT } from "@/i18n/server";
import Link from "next/link";
import type { Route } from "next";
import { Package, Search } from "lucide-react";
import { ListingCard } from "@/components/catalog/listing-card";
import { categoryVisual } from "@/components/portal/category-visual";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { CursorPagination } from "@/components/ui/pagination";
import {
  listPublicCatalog,
  listPublicCategories,
} from "@/server/repositories/catalog/public-cache";
import { catalogListQuerySchema } from "@/lib/schemas/catalog";
import {
  CATALOG_LABELS,
  CATALOG_ROUTE_SEGMENTS,
  type CatalogKind,
} from "@/server/domain/catalog/types";
import { cn } from "@/lib/utils";

const SORTS = [
  { key: "newest", label: msg("Newest"), sortBy: "createdAt", sortDir: "desc" },
  { key: "price-asc", label: msg("Price: low to high"), sortBy: "price", sortDir: "asc" },
  { key: "price-desc", label: msg("Price: high to low"), sortBy: "price", sortDir: "desc" },
  { key: "name", label: msg("Name: A to Z"), sortBy: "title", sortDir: "asc" },
] as const;

/**
 * The public browse page — shared by /products, /services, /projects (see
 * docs/adr/0011). Always queries with `publicOnly: true`, which forces
 * APPROVED + isActive regardless of any status param a visitor might try to
 * put in the URL — see src/server/repositories/catalog/query.ts.
 *
 * Layout: an ink header band (title, count, search), a category sidebar, and a
 * sortable grid. Every control is a plain link or GET form, so filters live in
 * the URL and work without JavaScript.
 */
export async function PublicCatalogList({
  kind,
  searchParams,
}: {
  kind: CatalogKind;
  searchParams: Record<string, string | undefined>;
}) {
  const t = await getT();
  const sort = SORTS.find((s) => s.key === searchParams["sort"]) ?? SORTS[0];
  const parsed = catalogListQuerySchema.safeParse({
    ...searchParams,
    sortBy: sort.sortBy,
    sortDir: sort.sortDir,
  });
  const query = parsed.success ? parsed.data : catalogListQuerySchema.parse({});

  const [{ items, nextCursor }, categories] = await Promise.all([
    listPublicCatalog(kind, query),
    listPublicCategories(kind),
  ]);

  const labels = CATALOG_LABELS[kind];
  const segment = CATALOG_ROUTE_SEGMENTS[kind];
  const activeCategory = categories.find((c: { id: string }) => c.id === query.categoryId);
  const hasActiveFilters = Boolean(query.search || query.categoryId);

  /** Builds a URL on this page with the given params changed (and paging reset). */
  const urlWith = (changes: Record<string, string | undefined>) => {
    const params = new URLSearchParams();
    const merged = {
      search: query.search,
      categoryId: query.categoryId,
      sort: sort.key,
      ...changes,
    };
    for (const [key, value] of Object.entries(merged)) {
      if (value && !(key === "sort" && value === "newest")) params.set(key, value);
    }
    const qs = params.toString();
    return `/${segment}${qs ? `?${qs}` : ""}` as Route;
  };

  return (
    <div>
      <header className="bg-ink bg-dots text-ink-foreground relative isolate overflow-hidden">
        <div
          aria-hidden="true"
          className="bg-primary/25 absolute -top-32 -right-24 -z-10 size-96 rounded-full blur-3xl"
        />
        <div className="mx-auto w-full max-w-7xl px-4 py-10 sm:py-14">
          <nav aria-label={t("Breadcrumb")} className="text-ink-foreground/70 mb-4 text-xs">
            <Link href="/" className="hover:text-ink-foreground">
              {t("Home")}
            </Link>{" "}
            / <span aria-current="page">{t(labels.plural)}</span>
            {activeCategory ? ` / ${activeCategory.name}` : ""}
          </nav>
          <div className="flex flex-wrap items-end justify-between gap-6">
            <div className="max-w-xl space-y-2">
              <h1 className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
                {activeCategory ? activeCategory.name : t(labels.plural)}
              </h1>
              <p className="text-ink-foreground/75">
                {t("{what} from approved vendors. Every seller is reviewed before they can list.", {
                  what: activeCategory
                    ? t(labels.plural)
                    : t("Browse {kind}", { kind: t(labels.plural).toLowerCase() }),
                })}
              </p>
            </div>
            <form method="get" role="search" className="flex w-full max-w-md gap-2">
              {query.categoryId ? (
                <input type="hidden" name="categoryId" value={query.categoryId} />
              ) : null}
              {sort.key !== "newest" ? <input type="hidden" name="sort" value={sort.key} /> : null}
              <label htmlFor="catalog-search" className="sr-only">
                {t("Search {kind}", { kind: t(labels.plural).toLowerCase() })}
              </label>
              <div className="relative flex-1">
                <Search
                  className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
                  aria-hidden="true"
                />
                <input
                  id="catalog-search"
                  name="search"
                  defaultValue={query.search}
                  placeholder={t("Search {kind}", { kind: t(labels.plural).toLowerCase() })}
                  className="bg-background text-foreground h-11 w-full rounded-lg border-0 pr-3 pl-9 text-sm shadow-sm outline-none focus-visible:ring-3 focus-visible:ring-white/40"
                />
              </div>
              <Button type="submit" size="touch">
                {t("Search")}
              </Button>
            </form>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl gap-8 px-4 py-8 lg:grid-cols-[15rem_1fr]">
        <aside aria-label={t("Categories")} className="lg:sticky lg:top-32 lg:self-start">
          <div className="surface-card overflow-hidden">
            <p className="border-b px-4 py-3 text-sm font-semibold">{t("Categories")}</p>
            <ul className="p-2">
              <li>
                <Link
                  href={urlWith({ categoryId: undefined })}
                  aria-current={!query.categoryId ? "page" : undefined}
                  className={cn(
                    "hover:bg-accent flex items-center gap-2 rounded-lg px-2 py-2 text-sm",
                    !query.categoryId && "bg-primary/10 text-primary font-semibold",
                  )}
                >
                  <span className="bg-muted text-muted-foreground flex size-7 items-center justify-center rounded-md">
                    <Package className="size-4" aria-hidden="true" />
                  </span>
                  {t("All {kind}", { kind: t(labels.plural).toLowerCase() })}
                </Link>
              </li>
              {categories.map((category: { id: string; name: string }) => {
                const visual = categoryVisual(category.name);
                const Icon = visual.icon;
                const active = category.id === query.categoryId;
                return (
                  <li key={category.id}>
                    <Link
                      href={urlWith({ categoryId: category.id })}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "hover:bg-accent flex items-center gap-2 rounded-lg px-2 py-2 text-sm",
                        active && "bg-primary/10 text-primary font-semibold",
                      )}
                    >
                      <span
                        className={cn(
                          "flex size-7 shrink-0 items-center justify-center rounded-md",
                          visual.tile,
                        )}
                      >
                        <Icon className="size-4" aria-hidden="true" />
                      </span>
                      <span className="truncate">{category.name}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </aside>

        <section aria-label={t(labels.plural)} className="min-w-0 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-muted-foreground text-sm">
              {items.length} {t(items.length === 1 ? labels.singular : labels.plural).toLowerCase()}
              {nextCursor ? "+" : ""}
              {query.search ? ` ${t("for “{query}”", { query: query.search })}` : ""}
            </p>
            <nav aria-label={t("Sort")} className="flex flex-wrap items-center gap-1.5 text-sm">
              <span className="text-muted-foreground mr-1">{t("Sort")}</span>
              {SORTS.map((option) => (
                <Link
                  key={option.key}
                  href={urlWith({ sort: option.key })}
                  aria-current={option.key === sort.key ? "true" : undefined}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs",
                    option.key === sort.key
                      ? "bg-ink text-ink-foreground border-ink"
                      : "bg-background hover:bg-accent",
                  )}
                >
                  {t(option.label)}
                </Link>
              ))}
            </nav>
          </div>

          {items.length === 0 ? (
            <EmptyState
              icon={Package}
              title={
                hasActiveFilters
                  ? t("No {kind} match your filters", { kind: t(labels.plural).toLowerCase() })
                  : t("No {kind} yet", { kind: t(labels.plural).toLowerCase() })
              }
              description={
                hasActiveFilters
                  ? t("Try a different search term or clear the filters.")
                  : t("Check back soon.")
              }
              action={
                hasActiveFilters ? (
                  <Link
                    href={`/${segment}` as Route}
                    className="text-primary text-sm font-medium hover:underline"
                  >
                    {t("Clear filters")}
                  </Link>
                ) : undefined
              }
            />
          ) : (
            <ul className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-4">
              {items.map((item, index) => (
                <li key={item.id}>
                  <ListingCard item={item} href={`/${segment}/${item.slug}`} priority={index < 4} />
                </li>
              ))}
            </ul>
          )}

          <CursorPagination nextCursor={nextCursor} />
        </section>
      </div>
    </div>
  );
}
