import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/server/lib/prisma";

export const BANNERS_TAG = "banners";

export interface BannerRow {
  id: string;
  headline: string;
  subline: string | null;
  ctaLabel: string;
  ctaHref: string;
  imagePath: string;
  sortOrder: number;
  isActive: boolean;
}

const SELECT = {
  id: true,
  headline: true,
  subline: true,
  ctaLabel: true,
  ctaHref: true,
  imagePath: true,
  sortOrder: true,
  isActive: true,
} as const;

/** Every banner, for the admin screen. */
export function listAllBanners(): Promise<BannerRow[]> {
  return prisma.banner.findMany({
    select: SELECT,
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
}

/**
 * The banners the homepage shows. Cached for a few minutes and refreshed the moment staff change a
 * banner (the tag is revalidated by every banner action), so a busy homepage is not a database query
 * per visitor.
 */
export const listActiveBanners = unstable_cache(
  async (): Promise<BannerRow[]> =>
    prisma.banner.findMany({
      where: { isActive: true },
      select: SELECT,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: 10,
    }),
  ["banners-active"],
  { tags: [BANNERS_TAG], revalidate: 300 },
);

export function getBanner(id: string) {
  return prisma.banner.findUnique({ where: { id }, select: SELECT });
}

export async function nextSortOrder(): Promise<number> {
  const last = await prisma.banner.aggregate({ _max: { sortOrder: true } });
  return (last._max.sortOrder ?? 0) + 1;
}

/** Swap places with the neighbouring banner, in one transaction. Returns false at the end of the list. */
export async function moveBanner(id: string, direction: "UP" | "DOWN"): Promise<boolean> {
  const all = await prisma.banner.findMany({
    select: { id: true, sortOrder: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
  });
  const index = all.findIndex((b) => b.id === id);
  const neighbour = all[direction === "UP" ? index - 1 : index + 1];
  if (index < 0 || !neighbour) return false;
  // Give every banner a clean 1..n order first (existing ties would make a plain swap a no-op).
  await prisma.$transaction(
    all.map((b, i) => {
      const position =
        b.id === id ? (direction === "UP" ? i - 1 : i + 1) : b.id === neighbour.id ? index : i;
      return prisma.banner.update({ where: { id: b.id }, data: { sortOrder: position + 1 } });
    }),
  );
  return true;
}
