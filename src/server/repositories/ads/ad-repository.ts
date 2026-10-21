import "server-only";
import { unstable_cache } from "next/cache";
import { prisma } from "@/server/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { AdStatus } from "@/generated/prisma/enums";
import { MAX_ACTIVE_ADS_ON_HOME } from "@/server/domain/ads/rules";

export const ADS_TAG = "ads";

const SELECT = {
  id: true,
  vendorId: true,
  headline: true,
  subline: true,
  ctaLabel: true,
  ctaHref: true,
  imagePath: true,
  status: true,
  isActive: true,
  rejectedReason: true,
  reviewedAt: true,
  createdAt: true,
  vendor: { select: { businessName: true, userId: true } },
} satisfies Prisma.AdvertisementSelect;

export type AdRow = Prisma.AdvertisementGetPayload<{ select: typeof SELECT }>;

/**
 * The ads the home page shows: approved and not paused, newest first. Cached for a few minutes and
 * refreshed the moment an ad changes (every ad action revalidates the tag), so a busy home page is
 * not a database query per visitor.
 */
export const listShowingAds = unstable_cache(
  async () =>
    prisma.advertisement.findMany({
      where: { status: "APPROVED", isActive: true },
      select: {
        id: true,
        headline: true,
        subline: true,
        ctaLabel: true,
        ctaHref: true,
        imagePath: true,
        vendor: { select: { businessName: true } },
      },
      orderBy: [{ reviewedAt: "desc" }, { createdAt: "desc" }],
      take: MAX_ACTIVE_ADS_ON_HOME,
    }),
  ["ads-showing"],
  { tags: [ADS_TAG], revalidate: 300 },
);

export function getAd(id: string) {
  return prisma.advertisement.findUnique({ where: { id }, select: SELECT });
}

export function listAdsForVendor(vendorId: string) {
  return prisma.advertisement.findMany({
    where: { vendorId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: SELECT,
  });
}

const PAGE_SIZE = 20;

/** Staff list: waiting ones first, then newest. Keyset pagination on a stable (status, createdAt, id) order. */
export async function listAdsForReview(filter: { status?: AdStatus; cursor?: string }) {
  const rows = await prisma.advertisement.findMany({
    where: filter.status ? { status: filter.status } : {},
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: PAGE_SIZE + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    select: SELECT,
  });
  const hasMore = rows.length > PAGE_SIZE;
  const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

export function countPendingAds() {
  return prisma.advertisement.count({ where: { status: "PENDING" } });
}

/** Active users who hold a permission through a current role, e.g. everyone who can review ads. */
export async function userIdsWithPermission(code: string, limit = 50): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      userRoles: {
        some: {
          revokedAt: null,
          role: { rolePermissions: { some: { permission: { code } } } },
        },
      },
    },
    select: { id: true },
    take: limit,
  });
  return users.map((u) => u.id);
}

export function createAd(data: Prisma.AdvertisementUncheckedCreateInput) {
  return prisma.advertisement.create({
    data,
    select: { id: true, vendor: { select: { businessName: true } } },
  });
}

/**
 * A guarded update: changes only the rows that still match `where` (for example "still pending") and returns
 * how many did, so two reviewers clicking at once cannot both win.
 */
export async function updateAdsWhere(
  where: Prisma.AdvertisementWhereInput,
  data: Prisma.AdvertisementUncheckedUpdateManyInput,
): Promise<number> {
  const result = await prisma.advertisement.updateMany({ where, data });
  return result.count;
}

export function deleteAd(id: string) {
  return prisma.advertisement.delete({ where: { id } });
}
