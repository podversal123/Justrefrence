import "server-only";
import { prisma } from "@/server/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { buildReferralPath, formatMemberId } from "@/server/domain/identity/member-id";

type Tx = Prisma.TransactionClient;

export async function getMemberProfileByUserId(userId: string) {
  return prisma.memberProfile.findUnique({ where: { userId } });
}

export async function getMemberProfileByReferralCode(referralCode: string) {
  return prisma.memberProfile.findUnique({ where: { referralCode } });
}

/**
 * Creates a member profile and assigns its public `memberId`/`referralCode`
 * in the same transaction. Two Prisma calls because the DB-assigned
 * `memberSeq` (autoincrement) isn't known until after the row exists — see
 * the schema comment on MemberProfile and docs/adr's discussion of why this
 * isn't a single insert.
 */
export async function createMemberProfile(
  tx: Tx,
  input: { userId: string; referredByUserId: string | null; parentReferralPath: string | null },
) {
  const created = await tx.memberProfile.create({
    data: {
      userId: input.userId,
      referredByUserId: input.referredByUserId,
      referralPath: "", // placeholder, replaced below once memberSeq/id are known
    },
  });

  const memberId = formatMemberId(created.memberSeq);
  const referralPath = buildReferralPath(input.parentReferralPath, created.id);

  return tx.memberProfile.update({
    where: { id: created.id },
    data: { memberId, referralCode: memberId, referralPath },
  });
}

export async function createReferralRelationship(
  tx: Tx,
  input: { memberId: string; referrerId: string },
) {
  return tx.referralRelationship.create({
    data: {
      memberId: input.memberId,
      referrerId: input.referrerId,
      level: 1,
      changedAt: new Date(),
    },
  });
}

export interface UpdateMemberDetailsInput {
  fullName: string;
  dob?: Date | undefined;
  pan?: string | undefined;
  gstin?: string | undefined;
  websiteUrl?: string | undefined;
  /** Free-form text (e.g. newline-separated links); stored as a JSON scalar. */
  socialLinks?: string | undefined;
}

export interface BirthdayMember {
  userId: string;
  email: string;
  fullName: string | null;
}

/**
 * Members whose `dob` matches today's month/day, any birth year — needs
 * EXTRACT(), which Prisma's query builder doesn't expose, so this is the one
 * sanctioned raw query in this repository. Used by the daily birthday-greeting
 * cron (see src/app/api/cron/birthday-notifications/route.ts and
 * docs/notifications.md §5).
 */
export async function findMembersWithBirthdayToday(): Promise<BirthdayMember[]> {
  return prisma.$queryRaw<BirthdayMember[]>`
    SELECT u.id AS "userId", u.email AS "email", u.full_name AS "fullName"
    FROM member_profiles mp
    JOIN users u ON u.id = mp.user_id
    WHERE mp.dob IS NOT NULL
      AND EXTRACT(MONTH FROM mp.dob) = EXTRACT(MONTH FROM CURRENT_DATE)
      AND EXTRACT(DAY FROM mp.dob) = EXTRACT(DAY FROM CURRENT_DATE)
      AND u.status = 'ACTIVE'
  `;
}

export interface MemberSearchResult {
  id: string;
  email: string;
  fullName: string | null;
  status: string;
  memberId: string | null;
}

/**
 * Admin "find a member" lookup by exact email — used by /admin/wallets to
 * locate the member whose wallet an admin wants to view/credit. There is no
 * dedicated search index or "list all members" repository function (and no
 * live-search UI pattern to copy elsewhere in the app yet), so this is a
 * deliberately simple exact-match (case-insensitive) lookup behind a plain
 * `?email=` search form, not a fuzzy/paginated browser.
 */
export async function findMemberByEmail(email: string): Promise<MemberSearchResult | null> {
  const user = await prisma.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: {
      id: true,
      email: true,
      fullName: true,
      status: true,
      memberProfile: { select: { memberId: true } },
    },
  });
  if (!user) return null;
  return {
    id: user.id,
    email: user.email,
    fullName: user.fullName,
    status: user.status,
    memberId: user.memberProfile?.memberId ?? null,
  };
}

export async function updateMemberDetails(userId: string, input: UpdateMemberDetailsInput) {
  return prisma.$transaction(async (tx) => {
    await tx.user.update({ where: { id: userId }, data: { fullName: input.fullName } });
    return tx.memberProfile.update({
      where: { userId },
      data: {
        dob: input.dob ?? null,
        pan: input.pan ?? null,
        gstin: input.gstin ?? null,
        websiteUrl: input.websiteUrl ?? null,
        socialLinks: input.socialLinks === undefined ? Prisma.JsonNull : input.socialLinks,
      },
    });
  });
}
