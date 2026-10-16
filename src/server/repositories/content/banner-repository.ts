import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/server/lib/prisma";
import type { BannerPlacement } from "@/generated/prisma/enums";

export const BANNERS_TAG = "banners";

export interface BannerRow {
  id: string;
  placement: BannerPlacement;
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
  placement: true,
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
 * The active banners for one place: the public home page (the default) or members' and sellers'
 * dashboards. Cached for a few minutes and refreshed the moment staff change a banner (the tag is
 * revalidated by every banner action), so a busy page is not a database query per visitor.
 */
const activeBannersCached = unstable_cache(
  async (placement: BannerPlacement): Promise<BannerRow[]> =>
    prisma.banner.findMany({
      where: { isActive: true, placement },
      select: SELECT,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: 10,
    }),
  ["banners-active"],
  { tags: [BANNERS_TAG], revalidate: 300 },
);

export function listActiveBanners(placement: BannerPlacement = "HOME"): Promise<BannerRow[]> {
  return activeBannersCached(placement);
}

export function getBanner(id: string) {
  return prisma.banner.findUnique({ where: { id }, select: SELECT });
}

export async function nextSortOrder(): Promise<number> {
  const last = await prisma.banner.aggregate({ _max: { sortOrder: true } });
  return (last._max.sortOrder ?? 0) + 1;
}

/** Swap places with the neighbouring banner, in one transaction. Returns false at the end of the list. */
export async function moveBanner(id: string, direction: "UP" | "DOWN"): Promise<boolean> {
  const current = await prisma.banner.findUnique({ where: { id }, select: { placement: true } });
  if (!current) return false;
  // Banners for the home page and for dashboards are ordered separately.
  const all = await prisma.banner.findMany({
    where: { placement: current.placement },
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
