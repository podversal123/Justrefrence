import "server-only";
import { unstable_cache } from "next/cache";
import type { CatalogKind, CatalogListItem, CatalogListQuery } from "@/server/domain/catalog/types";
import { CATALOG_PUBLIC_TAG } from "@/server/domain/catalog/cache-tags";
import { getCatalogRepository } from "./registry";

/** Short on purpose: if a change path forgets to invalidate, the public pages are at most this stale. */
const REVALIDATE_SECONDS = 60;

type CachedList = {
  items: (Omit<CatalogListItem, "createdAt"> & { createdAt: string })[];
  nextCursor: string | null;
};

/**
 * The cache stores JSON, so dates come back as strings; the key is the kind plus the query
 * serialised, so every distinct filter/sort/page gets its own entry.
 */
const listCached = unstable_cache(
  async (kind: CatalogKind, queryJson: string): Promise<CachedList> => {
    const result = await getCatalogRepository(kind).list(
      JSON.parse(queryJson) as CatalogListQuery,
      {
        publicOnly: true,
      },
    );
    return {
      items: result.items.map((item) => ({ ...item, createdAt: item.createdAt.toISOString() })),
      nextCursor: result.nextCursor,
    };
  },
  ["public-catalog-list"],
  { revalidate: REVALIDATE_SECONDS, tags: [CATALOG_PUBLIC_TAG] },
);

/** Public (approved, active) listings for the catalog pages, served from a short-lived shared cache. */
export async function listPublicCatalog(
  kind: CatalogKind,
  query: CatalogListQuery,
): Promise<{ items: CatalogListItem[]; nextCursor: string | null }> {
  const cached = await listCached(kind, JSON.stringify(query));
  return {
    items: cached.items.map((item) => ({ ...item, createdAt: new Date(item.createdAt) })),
    nextCursor: cached.nextCursor,
  };
}

const categoriesCached = unstable_cache(
  async (kind: CatalogKind) => {
    const rows = await getCatalogRepository(kind).listCategories();
    // Plain JSON only: the cache cannot hold Date objects.
    return JSON.parse(JSON.stringify(rows)) as unknown;
  },
  ["public-catalog-categories"],
  { revalidate: REVALIDATE_SECONDS, tags: [CATALOG_PUBLIC_TAG] },
);

export async function listPublicCategories(kind: CatalogKind) {
  return (await categoriesCached(kind)) as Awaited<
    ReturnType<ReturnType<typeof getCatalogRepository>["listCategories"]>
  >;
}
