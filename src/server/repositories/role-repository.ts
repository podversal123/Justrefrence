import "server-only";
import { prisma } from "@/server/lib/prisma";

export async function listRoles() {
  return prisma.role.findMany({
    orderBy: [{ isSystem: "desc" }, { label: "asc" }],
    select: {
      id: true,
      code: true,
      label: true,
      isSystem: true,
      _count: { select: { userRoles: { where: { revokedAt: null } } } },
    },
  });
}

export async function getRoleDetail(roleId: string) {
  return prisma.role.findUnique({
    where: { id: roleId },
    include: {
      rolePermissions: { include: { permission: true }, orderBy: { permission: { code: "asc" } } },
      userRoles: {
        where: { revokedAt: null },
        include: { user: { select: { id: true, email: true, fullName: true } } },
      },
    },
  });
}

export async function findRoleByCode(code: string) {
  return prisma.role.findUnique({ where: { code } });
}
