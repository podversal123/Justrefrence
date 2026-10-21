// Deliberately NO "server-only" import: same exception and rationale as wallet-repository.ts and
// payment-repository.ts. Tests exercise the services built on these queries against a fake database client,
// and the only dependency (`@/server/lib/prisma`) still carries the guard.
import { prisma } from "@/server/lib/prisma";

/** The whole user row, or null. */
export function findUserById(id: string) {
  return prisma.user.findUnique({ where: { id } });
}

/** Just the id, to check that an account exists. */
export function findUserIdById(id: string) {
  return prisma.user.findUnique({ where: { id }, select: { id: true } });
}

/** Id and status, to check that a message recipient exists and is not blocked. */
export function findUserIdAndStatus(id: string) {
  return prisma.user.findUnique({ where: { id }, select: { id: true, status: true } });
}

/** What blocking or unblocking a member needs to know about the account. */
export function findMemberModerationState(id: string) {
  return prisma.user.findUnique({
    where: { id },
    select: { status: true, emailVerifiedAt: true, memberProfile: { select: { id: true } } },
  });
}

export function findUserByEmail(email: string) {
  return prisma.user.findUnique({ where: { email } });
}

export function findUserIdByPhone(phone: string) {
  return prisma.user.findUnique({ where: { phone }, select: { id: true } });
}

/** The user who owns a 10-digit Member ID, or null (sign in by Member ID). */
export async function findUserByMemberId(memberId: string) {
  const profile = await prisma.memberProfile.findUnique({
    where: { memberId },
    select: { user: true },
  });
  return profile?.user ?? null;
}

/** Writes the failed-login counter and lock time after a sign-in attempt. */
export function setLoginAttemptState(
  userId: string,
  state: { failedLoginAttempts: number; lockedUntil: Date | null },
) {
  return prisma.user.update({
    where: { id: userId },
    data: { failedLoginAttempts: state.failedLoginAttempts, lockedUntil: state.lockedUntil },
  });
}
