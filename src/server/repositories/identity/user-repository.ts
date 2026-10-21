// Deliberately NO "server-only" import: same exception and rationale as wallet-repository.ts and
// payment-repository.ts. Tests exercise the services built on these queries against a fake database client,
// and the only dependency (`@/server/lib/prisma`) still carries the guard.
import { prisma } from "@/server/lib/prisma";
import type { Tx } from "@/server/repositories/transaction";

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

/** An admin account: the sign-in user and its role, created together or not at all. */
export function createStaffUser(input: {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  createdBy: string;
  roleId: string;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.user.create({
      data: {
        id: input.id,
        email: input.email,
        fullName: input.fullName,
        phone: input.phone,
        status: "PENDING_VERIFICATION",
        createdBy: input.createdBy,
      },
    });
    await tx.userRole.create({
      data: { userId: input.id, roleId: input.roleId, grantedBy: input.createdBy },
    });
  });
}

export function findUserFullName(id: string) {
  return prisma.user.findUnique({ where: { id }, select: { fullName: true } });
}

export function setUserFullName(id: string, fullName: string) {
  return prisma.user.update({ where: { id }, data: { fullName } });
}

export function findUserByPhone(phone: string) {
  return prisma.user.findUnique({ where: { phone } });
}

export function findUserIdByEmail(email: string) {
  return prisma.user.findUnique({ where: { email }, select: { id: true } });
}

/** A person retrying sign-up before verifying: keep their latest name and phone. */
export function updatePendingRegistration(userId: string, details: { fullName: string; phone: string }) {
  return prisma.user.update({
    where: { id: userId },
    data: { fullName: details.fullName, phone: details.phone },
  });
}

/** The local row for a new sign-up, waiting for the code to be confirmed. */
export function createPendingUser(input: { id: string; email: string; phone: string; fullName: string }) {
  return prisma.user.create({
    data: {
      id: input.id,
      email: input.email,
      phone: input.phone,
      fullName: input.fullName,
      status: "PENDING_VERIFICATION",
    },
  });
}

/** Marks a sign-up as confirmed, inside the transaction that also creates the member. */
export function activateUser(tx: Tx, userId: string) {
  return tx.user.update({
    where: { id: userId },
    data: { status: "ACTIVE", emailVerifiedAt: new Date() },
  });
}

/** A member made by an admin: active and verified from the start. */
export function createActiveUser(
  tx: Tx,
  input: { id: string; email: string; phone: string | null; fullName: string },
) {
  return tx.user.create({
    data: {
      id: input.id,
      email: input.email,
      phone: input.phone,
      fullName: input.fullName,
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
}

export function grantRole(tx: Tx, userId: string, roleId: string) {
  return tx.userRole.create({ data: { userId, roleId } });
}
