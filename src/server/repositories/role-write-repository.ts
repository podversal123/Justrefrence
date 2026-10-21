// Deliberately NO "server-only" import: same exception and rationale as wallet-repository.ts. Tests run the
// role actions against a fake database client, and the only dependency (`@/server/lib/prisma`) carries the guard.
import { prisma } from "@/server/lib/prisma";

export function findRoleById(id: string) {
  return prisma.role.findUnique({ where: { id } });
}

export function findRoleRowByCode(code: string) {
  return prisma.role.findUnique({ where: { code } });
}

/** A role with every permission it holds, to show and to compare before and after an edit. */
export function findRoleWithPermissions(id: string) {
  return prisma.role.findUnique({
    where: { id },
    include: { rolePermissions: { include: { permission: true } } },
  });
}

export function findPermissionsByCodes(codes: string[]) {
  return prisma.permission.findMany({ where: { code: { in: codes } } });
}

/** Creates a custom (non-system) role and its permissions in one transaction. */
export function createRoleWithPermissions(input: {
  code: string;
  label: string;
  permissionIds: string[];
}) {
  return prisma.$transaction(async (tx) => {
    const created = await tx.role.create({
      data: { code: input.code, label: input.label, isSystem: false },
    });
    if (input.permissionIds.length > 0) {
      await tx.rolePermission.createMany({
        data: input.permissionIds.map((permissionId) => ({ roleId: created.id, permissionId })),
      });
    }
    return created;
  });
}

/** Replaces a role's permissions with exactly this set, all or nothing. */
export function replaceRolePermissions(roleId: string, permissionIds: string[]) {
  return prisma.$transaction([
    prisma.rolePermission.deleteMany({ where: { roleId } }),
    prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId, permissionId })),
    }),
  ]);
}

export function findActiveRoleGrant(userId: string, roleId: string) {
  return prisma.userRole.findFirst({ where: { userId, roleId, revokedAt: null } });
}

export function createRoleGrant(userId: string, roleId: string, grantedBy: string) {
  return prisma.userRole.create({ data: { userId, roleId, grantedBy } });
}

export function findRoleGrantWithRole(id: string) {
  return prisma.userRole.findUnique({ where: { id }, include: { role: true } });
}

export function countActiveSuperAdmins() {
  return prisma.userRole.count({ where: { role: { code: "SUPER_ADMIN" }, revokedAt: null } });
}

export function revokeRoleGrant(id: string, revokedBy: string) {
  return prisma.userRole.update({ where: { id }, data: { revokedAt: new Date(), revokedBy } });
}
