/**
 * One-off, idempotent: adds the `wallet_pin:reset` permission to the database and grants it to the
 * Super Admin and Admin roles, matching prisma/seed.ts. Needed once on a database that was seeded
 * before the permission existed (the seed is not re-run on live data). Only adds rows, never removes.
 *
 *   npx tsx --conditions=react-server --env-file=.env --env-file=.env.local scripts/grant-wallet-pin-reset.ts
 */
import { prisma } from "@/server/lib/prisma";

const CODE = "wallet_pin:reset";
const ROLES = ["SUPER_ADMIN", "ADMIN"];

async function main() {
  const permission = await prisma.permission.upsert({
    where: { code: CODE },
    update: {},
    create: { code: CODE, description: "Clear a member's wallet PIN so they can set a new one" },
  });
  for (const code of ROLES) {
    const role = await prisma.role.findUnique({ where: { code } });
    if (!role) {
      console.log(`Role ${code} not found, skipped.`);
      continue;
    }
    await prisma.rolePermission.upsert({
      where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
      update: {},
      create: { roleId: role.id, permissionId: permission.id },
    });
    console.log(`Granted ${CODE} to ${code}.`);
  }
  await prisma.$disconnect();
}

void main();
