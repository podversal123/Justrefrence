import "server-only";
import { prisma } from "@/server/lib/prisma";
import { dayRangeBounds } from "@/lib/day-range";

/**
 * "Business" is the value of orders that actually went through (paid and beyond), counted for a member
 * themselves and for the people in their referral network. It is read only, and every figure is worked
 * out here from the orders, never typed in or kept as a separate total.
 *
 * A member's place in the network is their `referral_path`: the ids of everyone above them joined with
 * dots. Anyone whose path starts with "<my path>." is below me, and the extra dots say how deep:
 * one level down is a direct referral, two or more is indirect.
 */

const COUNTED = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED", "COMPLETED"] as const;

export interface BusinessFilter {
  from?: string;
  to?: string;
}

export interface BusinessTotals {
  own: bigint;
  direct: bigint;
  indirect: bigint;
  orders: number;
}

function range(filter: BusinessFilter) {
  const bounds = dayRangeBounds(filter.from, filter.to);
  return { from: bounds.gte ?? new Date(0), to: bounds.lt ?? new Date("9999-12-31T00:00:00Z") };
}

const depthOf = (path: string) => path.split(".").length;

/** My own business, my direct referrals' and everyone else in my network's, for the chosen dates. */
export async function getBusinessTotals(
  userId: string,
  myPath: string,
  filter: BusinessFilter,
): Promise<BusinessTotals> {
  const { from, to } = range(filter);
  const prefix = `${myPath}.`;
  const myDepth = depthOf(myPath);
  const rows = await prisma.$queryRaw<
    { own: bigint; direct: bigint; indirect: bigint; orders: bigint }[]
  >`
    SELECT
      COALESCE(SUM(CASE WHEN o.buyer_id = ${userId}::uuid THEN o.grand_total ELSE 0 END), 0)::bigint AS own,
      COALESCE(SUM(CASE WHEN starts_with(mp.referral_path, ${prefix})
        AND cardinality(string_to_array(mp.referral_path, '.')) = ${myDepth + 1} THEN o.grand_total ELSE 0 END), 0)::bigint AS direct,
      COALESCE(SUM(CASE WHEN starts_with(mp.referral_path, ${prefix})
        AND cardinality(string_to_array(mp.referral_path, '.')) > ${myDepth + 1} THEN o.grand_total ELSE 0 END), 0)::bigint AS indirect,
      COUNT(*)::bigint AS orders
    FROM orders o
    JOIN member_profiles mp ON mp.user_id = o.buyer_id
    WHERE o.status::text = ANY(${[...COUNTED]})
      AND o.created_at >= ${from} AND o.created_at < ${to}
      AND (o.buyer_id = ${userId}::uuid OR starts_with(mp.referral_path, ${prefix}))
  `;
  const row = rows[0];
  return {
    own: row?.own ?? 0n,
    direct: row?.direct ?? 0n,
    indirect: row?.indirect ?? 0n,
    orders: Number(row?.orders ?? 0n),
  };
}

export interface MonthlyBusiness {
  /** First day of the month, YYYY-MM-DD. */
  month: string;
  own: bigint;
  referral: bigint;
}

/** Business per month for the last `months` months, the member's own next to their network's. */
export async function getMonthlyBusiness(
  userId: string,
  myPath: string,
  months = 6,
): Promise<MonthlyBusiness[]> {
  const prefix = `${myPath}.`;
  const rows = await prisma.$queryRaw<{ month: string; own: bigint; referral: bigint }[]>`
    SELECT to_char(date_trunc('month', o.created_at), 'YYYY-MM-01') AS month,
      COALESCE(SUM(CASE WHEN o.buyer_id = ${userId}::uuid THEN o.grand_total ELSE 0 END), 0)::bigint AS own,
      COALESCE(SUM(CASE WHEN starts_with(mp.referral_path, ${prefix}) THEN o.grand_total ELSE 0 END), 0)::bigint AS referral
    FROM orders o
    JOIN member_profiles mp ON mp.user_id = o.buyer_id
    WHERE o.status::text = ANY(${[...COUNTED]})
      AND o.created_at >= date_trunc('month', now()) - make_interval(months => ${months - 1})
      AND (o.buyer_id = ${userId}::uuid OR starts_with(mp.referral_path, ${prefix}))
    GROUP BY 1
    ORDER BY 1
  `;
  return rows;
}

export interface MemberBusiness {
  memberId: string;
  name: string | null;
  /** 0 is the member themselves, 1 a direct referral, 2 and up are further down. */
  level: number;
  business: bigint;
  orders: number;
}

/**
 * One person's business, looked up by Member ID. Only the member themselves or someone in their
 * network can be found; any other ID answers null, so this cannot be used to look at strangers.
 */
export async function getMemberBusiness(
  userId: string,
  myPath: string,
  searchedMemberId: string,
  filter: BusinessFilter,
): Promise<MemberBusiness | null> {
  const target = await prisma.memberProfile.findUnique({
    where: { memberId: searchedMemberId },
    select: {
      userId: true,
      memberId: true,
      referralPath: true,
      user: { select: { fullName: true } },
    },
  });
  if (!target || !target.memberId) return null;

  const isMe = target.userId === userId;
  const inNetwork = target.referralPath.startsWith(`${myPath}.`);
  if (!isMe && !inNetwork) return null;

  const { from, to } = range(filter);
  const sum = await prisma.order.aggregate({
    where: {
      buyerId: target.userId,
      status: { in: [...COUNTED] },
      createdAt: { gte: from, lt: to },
    },
    _sum: { grandTotal: true },
    _count: { _all: true },
  });
  return {
    memberId: target.memberId,
    name: target.user.fullName,
    level: isMe ? 0 : depthOf(target.referralPath) - depthOf(myPath),
    business: sum._sum.grandTotal ?? 0n,
    orders: sum._count._all,
  };
}
