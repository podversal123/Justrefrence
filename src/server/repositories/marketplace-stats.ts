import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/server/lib/prisma";
import { getCatalogRepository } from "@/server/repositories/catalog/registry";
import { countOpenRequirements } from "@/server/repositories/bidding/bidding-repository";

/**
 * Read-only aggregates for the public portal (header category nav, homepage
 * stats strip and "popular categories"). Everything here counts ONLY
 * publicly visible rows (APPROVED + active + not soft-deleted — the same
 * predicate the listing pages use) so the numbers on the homepage always
 * match what a visitor finds when they click through. Cached for five
 * minutes: these are marketing numbers on the busiest page, not live
 * inventory, and caching keeps the homepage off the database hot path.
 */

const REVALIDATE_SECONDS = 300;
const PUBLIC_ITEM = { deletedAt: null, approvalStatus: "APPROVED", isActive: true } as const;

export interface MarketplaceStats {
  vendors: number;
  products: number;
  services: number;
  projects: number;
  /** Requirements currently open for bidding. */
  bids: number;
}

export interface CategoryWithCount {
  id: string;
  name: string;
  itemCount: number;
}

export const getMarketplaceStats = unstable_cache(
  async (): Promise<MarketplaceStats> => {
    const [vendors, products, services, projects, bids] = await Promise.all([
      prisma.vendorProfile.count({ where: { approvalStatus: "APPROVED" } }),
      getCatalogRepository("PRODUCT").count({}, { publicOnly: true }),
      getCatalogRepository("SERVICE").count({}, { publicOnly: true }),
      getCatalogRepository("PROJECT").count({}, { publicOnly: true }),
      countOpenRequirements(),
    ]);
    return { vendors, products, services, projects, bids };
  },
  ["marketplace-stats"],
  { revalidate: REVALIDATE_SECONDS, tags: ["marketplace-stats"] },
);

async function productCategoriesWithCounts(): Promise<CategoryWithCount[]> {
  const [categories, counts] = await Promise.all([
    prisma.productCategory.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.product.groupBy({ by: ["categoryId"], where: PUBLIC_ITEM, _count: { _all: true } }),
  ]);
  const byId = new Map(counts.map((c) => [c.categoryId, c._count._all]));
  return categories.map((c) => ({ ...c, itemCount: byId.get(c.id) ?? 0 }));
}

async function serviceCategoriesWithCounts(): Promise<CategoryWithCount[]> {
  const [categories, counts] = await Promise.all([
    prisma.serviceCategory.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.service.groupBy({ by: ["categoryId"], where: PUBLIC_ITEM, _count: { _all: true } }),
  ]);
  const byId = new Map(counts.map((c) => [c.categoryId, c._count._all]));
  return categories.map((c) => ({ ...c, itemCount: byId.get(c.id) ?? 0 }));
}

export const getProductCategoriesWithCounts = unstable_cache(
  productCategoriesWithCounts,
  ["product-categories-with-counts"],
  { revalidate: REVALIDATE_SECONDS, tags: ["marketplace-stats"] },
);

export const getServiceCategoriesWithCounts = unstable_cache(
  serviceCategoriesWithCounts,
  ["service-categories-with-counts"],
  { revalidate: REVALIDATE_SECONDS, tags: ["marketplace-stats"] },
);
