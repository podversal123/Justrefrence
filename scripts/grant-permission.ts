/**
 * One-off, idempotent: makes sure a permission exists in the database and grants it to the named roles,
 * matching prisma/seed.ts. Needed once on a database that was seeded before the permission existed (the
 * seed is not re-run on live data). Only adds rows, never removes.
 *
 *   npx tsx --conditions=react-server --env-file=.env --env-file=.env.local scripts/grant-permission.ts two_step:reset SUPER_ADMIN "Clear another account's two-step login"
 *
 * Arguments: the permission code, a comma-separated list of role codes, and a short description.
 */
import { prisma } from "@/server/lib/prisma";

async function main() {
  const [code, roleList, description] = process.argv.slice(2);
  if (!code || !roleList) {
    console.error("Usage: grant-permission.ts <permission-code> <ROLE[,ROLE]> [description]");
    process.exit(1);
  }
  const permission = await prisma.permission.upsert({
    where: { code },
    update: {},
    create: { code, description: description ?? code },
  });
  for (const roleCode of roleList
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean)) {
    const role = await prisma.role.findUnique({ where: { code: roleCode } });
    if (!role) {
      console.log(`Role ${roleCode} not found, skipped.`);
      continue;
    }
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: {},
      create: { roleId: role.id, permissionId: permission.id },
    });
    console.log(`Granted ${code} to ${roleCode}.`);
  }
  await prisma.$disconnect();
}

void main();
