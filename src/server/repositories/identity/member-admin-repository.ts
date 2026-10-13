import "server-only";
import { prisma } from "@/server/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { UserStatus } from "@/generated/prisma/enums";
import { dayRangeBounds } from "@/lib/day-range";

/** Roles that mean "this is a staff account" — those are managed under Admins, never as members. */
export const STAFF_ROLE_CODES = ["SUPER_ADMIN", "ADMIN", "FINANCE", "SUPPORT"] as const;

const PAGE_SIZE = 50;

export interface MemberListFilter {
  search?: string;
  status?: UserStatus;
  /** Inclusive date range on registration date (YYYY-MM-DD). */
  from?: string;
  to?: string;
  cursor?: string;
}

/** The one definition of the admin member filters, shared by the list and the report download. */
function memberWhere(filter: MemberListFilter): Prisma.UserWhereInput {
  const search = filter.search?.trim();
  const createdAt = dayRangeBounds(filter.from, filter.to);
  return {
    memberProfile: { isNot: null },
    userRoles: { none: { role: { code: { in: [...STAFF_ROLE_CODES] } }, revokedAt: null } },
    ...(filter.status ? { status: filter.status } : {}),
    ...(Object.keys(createdAt).length ? { createdAt } : {}),
    ...(search
      ? {
          OR: [
            { email: { contains: search, mode: "insensitive" } },
            { fullName: { contains: search, mode: "insensitive" } },
            { phone: { contains: search } },
            { memberProfile: { memberId: { contains: search, mode: "insensitive" } } },
          ],
        }
      : {}),
  };
}

/**
 * Admin member list: every non-staff account that has a member profile,
 * date-wise (newest first) with search/status/date filters — the "Date-wise
 * Member List / Filter Member List / Blocked List" items of the workflow
 * doc. Keyset-paginated; selects only list columns (no PAN, bank, etc.).
 */
export async function listMembers(filter: MemberListFilter) {
  const rows = await prisma.user.findMany({
    where: memberWhere(filter),
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: PAGE_SIZE + 1,
    ...(filter.cursor ? { cursor: { id: filter.cursor }, skip: 1 } : {}),
    select: {
      id: true,
      email: true,
      phone: true,
      fullName: true,
      status: true,
      createdAt: true,
      memberProfile: { select: { memberId: true, kycStatus: true } },
      vendorProfile: { select: { businessName: true } },
    },
  });

  const hasMore = rows.length > PAGE_SIZE;
  const page = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
  return { members: page, nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null };
}

/** Hard cap for one downloaded report; the caller is told when the data was cut off. */
export const MEMBER_REPORT_MAX_ROWS = 10_000;

/**
 * Everything the "Member Report" download needs, for the same filters as the on-screen list.
 * No PAN, bank or other KYC document data: those stay on the member's own page.
 */
export async function listMembersForReport(filter: Omit<MemberListFilter, "cursor">) {
  const rows = await prisma.user.findMany({
    where: memberWhere(filter),
    orderBy: [{ createdAt: "desc" }, { id: "asc" }],
    take: MEMBER_REPORT_MAX_ROWS + 1,
    select: {
      email: true,
      phone: true,
      fullName: true,
      status: true,
      createdAt: true,
      memberProfile: {
        select: {
          memberId: true,
          kycStatus: true,
          referredByUser: { select: { memberProfile: { select: { memberId: true } } } },
        },
      },
      vendorProfile: { select: { businessName: true } },
      wallet: { select: { balance: true } },
    },
  });
  const truncated = rows.length > MEMBER_REPORT_MAX_ROWS;
  return { rows: truncated ? rows.slice(0, MEMBER_REPORT_MAX_ROWS) : rows, truncated };
}

export async function countMembersByStatus() {
  const rows = await prisma.user.groupBy({
    by: ["status"],
    where: {
      memberProfile: { isNot: null },
      userRoles: { none: { role: { code: { in: [...STAFF_ROLE_CODES] } }, revokedAt: null } },
    },
    _count: { _all: true },
  });
  return Object.fromEntries(rows.map((r) => [r.status, r._count._all])) as Partial<
    Record<UserStatus, number>
  >;
}

/** Detail view data: profile, direct referrals, masked bank, wallet balance — no encrypted fields. */
export async function getMemberDetail(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      phone: true,
      fullName: true,
      status: true,
      emailVerifiedAt: true,
      createdAt: true,
      userRoles: { where: { revokedAt: null }, select: { role: { select: { code: true } } } },
      memberProfile: {
        select: {
          id: true,
          memberId: true,
          referralCode: true,
          kycStatus: true,
          dob: true,
          pan: true,
          gstin: true,
          websiteUrl: true,
          socialLinks: true,
          telephone: true,
          referredByUser: { select: { fullName: true, email: true } },
        },
      },
      vendorProfile: { select: { businessName: true, approvalStatus: true } },
      wallet: { select: { balance: true, pendingBalance: true } },
      bankAccounts: {
        where: { deletedAt: null },
        select: { accountHolderName: true, accountNoMasked: true, ifsc: true, verifiedAt: true },
        take: 1,
      },
    },
  });
  if (!user?.memberProfile) return null;

  const directReferrals = await prisma.memberProfile.findMany({
    where: { referredByUserId: userId },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { memberId: true, createdAt: true, user: { select: { fullName: true, email: true } } },
  });
  return { user, directReferrals };
}

/** Atomic: only flips when the account isn't already in the target state. */
export async function setUserStatus(userId: string, status: UserStatus): Promise<boolean> {
  const result = await prisma.user.updateMany({
    where: { id: userId, status: { not: status } },
    data: { status },
  });
  return result.count > 0;
}

export async function isStaffAccount(userId: string): Promise<boolean> {
  const count = await prisma.userRole.count({
    where: { userId, revokedAt: null, role: { code: { in: [...STAFF_ROLE_CODES] } } },
  });
  return count > 0;
}
