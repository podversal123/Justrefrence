import "server-only";
import { prisma } from "@/server/lib/prisma";
import { getCatalogRepository } from "@/server/repositories/catalog/registry";
import {
  CATALOG_ROUTE_SEGMENTS,
  type CatalogKind,
  type CatalogListItem,
} from "@/server/domain/catalog/types";

/**
 * One search across products, services and projects (plus matching
 * categories) for the header typeahead and the /search results page.
 * Everything goes through the catalog repositories with `publicOnly: true`,
 * so only APPROVED + active listings can ever appear — the same guarantee
 * the browse pages give.
 */

export const MIN_QUERY_LENGTH = 2;
export const MAX_QUERY_LENGTH = 80;

export interface SearchHit {
  kind: CatalogKind;
  id: string;
  title: string;
  href: string;
  categoryName: string;
  vendorBusinessName: string;
  /** Paise as a string (BigInt isn't JSON-safe), or null for "quote on request". */
  price: string | null;
  currency: string;
  imagePath: string | null;
}

export interface CategoryHit {
  kind: "PRODUCT" | "SERVICE";
  id: string;
  name: string;
  href: string;
}

export interface MarketplaceSearchResult {
  query: string;
  products: SearchHit[];
  services: SearchHit[];
  projects: SearchHit[];
  categories: CategoryHit[];
}

/** Trims, collapses whitespace and bounds the length; returns null when too short to search. */
export function normalizeQuery(raw: string | null | undefined): string | null {
  const query = (raw ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_QUERY_LENGTH);
  return query.length >= MIN_QUERY_LENGTH ? query : null;
}

/** Titles that start with the query rank first, then titles that contain it, then description-only matches. */
export function rankByTitle<T extends { title: string }>(items: T[], query: string): T[] {
  const needle = query.toLowerCase();
  const score = (title: string) => {
    const t = title.toLowerCase();
    if (t.startsWith(needle)) return 0;
    if (t.split(/[\s,()-]+/).some((word) => word.startsWith(needle))) return 1;
    if (t.includes(needle)) return 2;
    return 3;
  };
  return items
    .map((item, index) => ({ item, index, rank: score(item.title) }))
    .sort((a, b) => a.rank - b.rank || a.index - b.index)
    .map((entry) => entry.item);
}

function toHit(kind: CatalogKind, item: CatalogListItem): SearchHit {
  return {
    kind,
    id: item.id,
    title: item.title,
    href: `/${CATALOG_ROUTE_SEGMENTS[kind]}/${item.slug}`,
    categoryName: item.categoryName,
    vendorBusinessName: item.vendorBusinessName,
    price: item.price,
    currency: item.currency,
    imagePath: item.primaryImagePath,
  };
}

async function searchKind(kind: CatalogKind, query: string, fetchLimit: number, keep: number) {
  const { items } = await getCatalogRepository(kind).list(
    { search: query, sortBy: "createdAt", sortDir: "desc", limit: fetchLimit },
    { publicOnly: true },
  );
  return rankByTitle(items, query)
    .slice(0, keep)
    .map((item) => toHit(kind, item));
}

async function searchCategories(query: string, keep: number): Promise<CategoryHit[]> {
  const where = { deletedAt: null, name: { contains: query, mode: "insensitive" as const } };
  const [products, services] = await Promise.all([
    prisma.productCategory.findMany({
      where,
      take: keep,
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.serviceCategory.findMany({
      where,
      take: keep,
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);
  return [
    ...products.map((c) => ({
      kind: "PRODUCT" as const,
      id: c.id,
      name: c.name,
      href: `/products?categoryId=${c.id}`,
    })),
    ...services.map((c) => ({
      kind: "SERVICE" as const,
      id: c.id,
      name: c.name,
      href: `/services?categoryId=${c.id}`,
    })),
  ].slice(0, keep);
}

/**
 * `perKind` is how many hits to return per group (typeahead: 4, results
 * page: 8). Each group is fetched with extra headroom so ranking can pull
 * the best title matches to the top.
 */
export async function searchMarketplace(
  query: string,
  { perKind, categories = 3 }: { perKind: number; categories?: number },
): Promise<MarketplaceSearchResult> {
  const fetchLimit = Math.min(perKind * 3, 30);
  const [products, services, projects, categoryHits] = await Promise.all([
    searchKind("PRODUCT", query, fetchLimit, perKind),
    searchKind("SERVICE", query, fetchLimit, perKind),
    searchKind("PROJECT", query, fetchLimit, perKind),
    categories > 0 ? searchCategories(query, categories) : Promise.resolve([]),
  ]);
  return { query, products, services, projects, categories: categoryHits };
}
