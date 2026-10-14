import "server-only";
import { prisma } from "@/server/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { RewardType } from "@/generated/prisma/enums";
import type { RewardStatus } from "@/server/domain/rewards/rules";

const REWARD_SELECT = {
  id: true,
  rewardSeq: true,
  type: true,
  title: true,
  reason: true,
  amount: true,
  expiresAt: true,
  usedAt: true,
  createdAt: true,
  coupon: {
    select: {
      code: true,
      discountType: true,
      valuePercentBps: true,
      valueFixed: true,
      minOrderAmount: true,
      expiresAt: true,
      deletedAt: true,
      _count: { select: { redemptions: true } },
    },
  },
  member: {
    select: { memberId: true, user: { select: { fullName: true, email: true } } },
  },
} satisfies Prisma.RewardSelect;

export type RewardRow = Prisma.RewardGetPayload<{ select: typeof REWARD_SELECT }>;

const PAGE_SIZE = 20;

export interface RewardFilter {
  search?: string;
  type?: RewardType;
  status?: RewardStatus;
  cursor?: string;
}

/** `RWD-000012`, `rwd12` or `12` all find reward #12, alongside the text search. */
function sequenceFromSearch(search: string): bigint | null {
  const match = /^(?:rwd-?)?0*(\d{1,12})$/i.exec(search.trim());
  return match?.[1] ? BigInt(match[1]) : null;
}

/** The three statuses, written as database conditions that mirror rewardStatus() in rules.ts. */
function statusWhere(status: RewardStatus, now: Date): Prisma.RewardWhereInput {
  const notExpired = [{ expiresAt: null }, { expiresAt: { gt: now } }];
  if (status === "USED") {
    return {
      OR: [
        { type: "CASH" },
        { type: "OTHER", usedAt: { not: null } },
        { type: "COUPON", coupon: { redemptions: { some: {} } } },
      ],
    };
  }
  if (status === "EXPIRED") {
    return {
      OR: [
        { type: "OTHER", usedAt: null, expiresAt: { lte: now } },
        {
          type: "COUPON",
          coupon: {
            redemptions: { none: {} },
            OR: [{ deletedAt: { not: null } }, { expiresAt: { lte: now } }],
          },
        },
      ],
    };
  }
  return {
    OR: [
      { type: "OTHER", usedAt: null, OR: notExpired },
      {
        type: "COUPON",
        coupon: { redemptions: { none: {} }, deletedAt: null, OR: notExpired },
      },
    ],
  };
}

function buildWhere(filter: RewardFilter, now: Date): Prisma.RewardWhereInput {
  const and: Prisma.RewardWhereInput[] = [];
  if (filter.type) and.push({ type: filter.type });
  if (filter.status) and.push(statusWhere(filter.status, now));
  const search = filter.search?.trim();
  if (search) {
    const seq = sequenceFromSearch(search);
    and.push({
      OR: [
        { title: { contains: search, mode: "insensitive" } },
        { member: { memberId: { contains: search, mode: "insensitive" } } },
        { member: { user: { email: { contains: search, mode: "insensitive" } } } },
        { member: { user: { fullName: { contains: search, mode: "insensitive" } } } },
        ...(seq !== null ? [{ rewardSeq: seq }] : []),
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

/** Staff list: newest first, keyset pagination. */
export async function listRewardsForAdmin(filter: RewardFilter, now = new Date()) {
  const rows = await prisma.reward.findMany({
    where: buildWhere(filter, now),
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: PAGE_SIZE + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    select: REWARD_SELECT,
  });
  const hasMore = rows.length > PAGE_SIZE;
  const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  return { items, nextCursor: hasMore ? (items.at(-1)?.id ?? null) : null };
}

/** Everything one member has been paid, newest first. */
export async function listRewardsForMember(memberProfileId: string) {
  return prisma.reward.findMany({
    where: { memberId: memberProfileId },
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: 200,
    select: REWARD_SELECT,
  });
}

export function toRewardFacts(row: RewardRow) {
  return {
    type: row.type,
    expiresAt: row.expiresAt,
    usedAt: row.usedAt,
    coupon: row.coupon
      ? {
          expiresAt: row.coupon.expiresAt,
          deletedAt: row.coupon.deletedAt,
          redeemed: row.coupon._count.redemptions > 0,
        }
      : null,
  };
}
