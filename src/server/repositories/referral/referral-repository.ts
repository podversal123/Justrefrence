import "server-only";
import { prisma } from "@/server/lib/prisma";

/** This member's direct (level-1) referrals — docs/rbac.md `referral:read`. */
export async function getDirectReferrals(memberId: string) {
  return prisma.referralRelationship.findMany({
    where: { referrerId: memberId },
    orderBy: { changedAt: "desc" },
    include: {
      member: {
        select: {
          id: true,
          memberId: true,
          createdAt: true,
          user: { select: { fullName: true, email: true } },
        },
      },
    },
  });
}

/**
 * Walks UP the referral chain one hop at a time, from `buyerMemberId`'s
 * direct referrer (level 1) to its referrer's referrer (level 2), etc., up
 * to `maxLevel` hops. Only the configured-active rule levels actually get
 * walked (Q-01: "only the number of levels configured as active in
 * commission_rules actually pays out"), so this is a small, bounded number
 * of sequential lookups — not a full tree scan, and deliberately NOT a
 * `referralPath` prefix query (which answers "who is below me", the
 * opposite direction).
 */
export async function getAncestorChain(
  buyerMemberId: string,
  maxLevel: number,
): Promise<{ level: number; memberId: string }[]> {
  const chain: { level: number; memberId: string }[] = [];
  let currentMemberId = buyerMemberId;

  for (let level = 1; level <= maxLevel; level++) {
    const relationship = await prisma.referralRelationship.findUnique({
      where: { memberId: currentMemberId },
      select: { referrerId: true },
    });
    if (!relationship) break; // chain exhausted — no referrer at this depth
    chain.push({ level, memberId: relationship.referrerId });
    currentMemberId = relationship.referrerId;
  }

  return chain;
}

/**
 * All descendants of `referralPath` — the referral TREE, not just direct
 * referrals. A plain `startsWith` prefix match on the (still plain-text,
 * not yet native ltree — see the schema comment on
 * MemberProfile.referralPath) path column; functionally equivalent to
 * ltree's `<@` operator, just without the GiST index's performance
 * benefit until that migration lands on a live database.
 */
export async function getReferralTree(referralPath: string, limit = 200) {
  return prisma.memberProfile.findMany({
    where: { referralPath: { startsWith: `${referralPath}.` } },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: {
      id: true,
      memberId: true,
      referralPath: true,
      createdAt: true,
      user: { select: { fullName: true, email: true } },
    },
  });
}

/** Q-04's "minimum activity" — this member's own completed-order count. See docs/adr/0014 for why this specific definition was chosen. */
export async function countCompletedOrders(userId: string): Promise<number> {
  return prisma.order.count({ where: { buyerId: userId, status: "COMPLETED" } });
}

/** Chronological referral events under this member — signups (and, rarely, SUPER_ADMIN repoints). */
export async function getReferralHistory(memberId: string, limit = 50) {
  return prisma.referralRelationship.findMany({
    where: { referrerId: memberId },
    orderBy: { changedAt: "desc" },
    take: limit,
    include: {
      member: { select: { memberId: true, user: { select: { fullName: true, email: true } } } },
    },
  });
}
