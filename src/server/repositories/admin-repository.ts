import "server-only";
import { prisma } from "@/server/lib/prisma";
import { SYSTEM_ROLES } from "@/server/auth/permissions";

/** Staff roles — everyone else (VENDOR, CUSTOMER, custom member-facing roles) is not "an admin." */
const STAFF_ROLE_CODES = SYSTEM_ROLES.filter((code) => code !== "VENDOR" && code !== "CUSTOMER");

export async function listAdmins() {
  return prisma.user.findMany({
    where: {
      userRoles: {
        some: { revokedAt: null, role: { code: { in: [...STAFF_ROLE_CODES] } } },
      },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      fullName: true,
      status: true,
      createdAt: true,
      userRoles: {
        where: { revokedAt: null },
        select: { id: true, role: { select: { id: true, code: true, label: true } } },
      },
    },
  });
}

export async function getAdminById(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      fullName: true,
      status: true,
      createdAt: true,
      userRoles: {
        where: { revokedAt: null },
        select: {
          id: true,
          grantedAt: true,
          role: { select: { id: true, code: true, label: true } },
        },
      },
    },
  });
}
