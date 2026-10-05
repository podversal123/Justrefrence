/**
 * Seeds the static RBAC catalog — roles, permissions, and the default
 * role→permission grants from docs/rbac.md §4. This is data, not business
 * logic: it defines what a role CAN do; whether a given feature exists to
 * exercise that permission is a separate (later-phase) question.
 *
 * Run via `npx prisma migrate dev` (auto-seeds) or `npx prisma db seed`.
 */
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PERMISSIONS,
  SYSTEM_ROLES,
  type Permission,
  type SystemRoleCode,
} from "../src/server/auth/permissions";

const adapter = new PrismaPg({ connectionString: process.env["DATABASE_URL"] });
const prisma = new PrismaClient({ adapter });

const PERMISSION_LABELS: Partial<Record<Permission, string>> = {
  "user:create": "Create admin/staff users",
  "user:block": "Block a user account",
  "user:unblock": "Unblock a user account",
  "role:assign": "Assign or revoke a user's role",
  "permission:update": "Change a role's permission bundle",
  "vendor:approve": "Approve a vendor application",
  "vendor:reject": "Reject a vendor application",
  "vendor:suspend": "Suspend an approved vendor",
  "vendor:apply": "Apply to become a vendor",
  "referral:repoint": "Change a member's referrer (Super Admin only, audited)",
  "commission_rule:update": "Activate a commission rule version",
  "payout:approve": "Approve a payout request",
  "payout:reject": "Reject a payout request",
  "maintenance:toggle": "Turn maintenance mode on/off",
  "audit:read": "Read the platform audit log",
  "settings:update": "Change platform settings",
};

function label(code: Permission): string {
  return PERMISSION_LABELS[code] ?? code.replace(/[:_]/g, " ");
}

const ROLE_LABELS: Record<SystemRoleCode, string> = {
  SUPER_ADMIN: "Super Admin",
  ADMIN: "Admin",
  FINANCE: "Finance",
  SUPPORT: "Support",
  VENDOR: "Vendor",
  CUSTOMER: "Customer",
};

// Default grants per role — transcribed from docs/rbac.md §4. Anything not
// listed for a role is denied by default and can only be added via an
// explicit, audited grant (role:assign / permission:update).
const ROLE_PERMISSIONS: Record<SystemRoleCode, Permission[]> = {
  SUPER_ADMIN: [...PERMISSIONS], // Super Admin holds the full catalog by definition.

  ADMIN: [
    "user:create",
    "user:read",
    "user:block",
    "user:unblock",
    "role:read",
    "permission:read",
    "vendor:apply",
    "vendor:approve",
    "vendor:reject",
    "vendor:suspend",
    "product:create",
    "product:read",
    "product:update",
    "product:delete",
    "product:approve",
    "service:create",
    "service:read",
    "service:update",
    "service:delete",
    "service:approve",
    "project:create",
    "project:read",
    "project:update",
    "project:delete",
    "project:approve",
    "category:manage",
    "order:read",
    "order:read:any",
    "order:update_status",
    "order:cancel",
    "invoice:read",
    "invoice:generate",
    "payment:read",
    "referral:read",
    "referral:read:any",
    "referral:create",
    "epin:generate",
    "epin:read",
    "epin:read:any",
    "epin:redeem",
    "epin:revoke",
    "bank_account:verify",
    "coupon:create",
    "coupon:update",
    "coupon:read",
    "reward:grant",
    "bid:read:any",
    "message:send",
    "message:read",
    "ticket:create",
    "ticket:read",
    "ticket:read:any",
    "ticket:respond",
    "ticket:close",
    "notification:read",
    "blog:create",
    "blog:publish",
    "banner:manage",
    "feedback:read",
    "member:read",
    "member:read:any",
    "member:block",
    "member:unblock",
    "member:filter_list",
    "settings:read",
  ],

  FINANCE: [
    "user:read",
    "order:read",
    "order:read:any",
    "invoice:read",
    "payment:read",
    "referral:read",
    "referral:read:any",
    "referral:create",
    "commission:read",
    "commission:read:any",
    "commission:approve",
    "commission_rule:read",
    "wallet:read",
    "wallet:read:any",
    "wallet:topup",
    "payout:approve",
    "payout:reject",
    "payout:record_transfer",
    "bank_account:verify",
    "subscription_plan:manage",
    "subscription:read",
    "reward:grant",
    "tds_rule:manage",
    "gst_rule:manage",
    "tds:read",
    "tds:read:any",
    "tds_report:export",
    "epin:read",
    "epin:redeem",
    "coupon:read",
  ],

  SUPPORT: [
    "user:read",
    "order:read",
    "order:read:any",
    "invoice:read",
    "referral:read:any",
    "wallet:read:any",
    "epin:read",
    "epin:redeem",
    "coupon:read",
    "message:send",
    "message:read",
    "ticket:create",
    "ticket:read",
    "ticket:read:any",
    "ticket:respond",
    "ticket:close",
    "notification:read",
    "feedback:read",
    "member:read",
    "member:read:any",
  ],

  VENDOR: [
    "product:create",
    "product:read",
    "product:update",
    "product:delete",
    "service:create",
    "service:read",
    "service:update",
    "service:delete",
    "project:create",
    "project:read",
    "project:update",
    "project:delete",
    "cart:manage",
    "order:create",
    "order:read",
    "order:update_status",
    "order:cancel",
    "invoice:read",
    "payment:read",
    "referral:read",
    "referral:create",
    "commission:read",
    "wallet:read",
    "wallet:topup",
    "wallet:withdraw",
    "wallet_pin:set",
    "payout:request",
    "epin:read",
    "epin:redeem",
    "coupon:redeem",
    "reward:read",
    "tds:read",
    "bid:submit",
    "message:send",
    "message:read",
    "ticket:create",
    "ticket:read",
    "notification:read",
    "feedback:submit",
    "member:read",
  ],

  CUSTOMER: [
    "vendor:apply",
    "product:read",
    "service:read",
    "project:read",
    "cart:manage",
    "order:create",
    "order:read",
    "order:cancel",
    "invoice:read",
    "payment:read",
    "referral:read",
    "referral:create",
    "commission:read",
    "wallet:read",
    "wallet:topup",
    "wallet:withdraw",
    "wallet_pin:set",
    "payout:request",
    "epin:read",
    "epin:redeem",
    "coupon:redeem",
    "reward:read",
    "tds:read",
    "requirement:create",
    "bid:accept",
    "message:send",
    "message:read",
    "ticket:create",
    "ticket:read",
    "notification:read",
    "feedback:submit",
    "member:read",
  ],
};

async function main() {
  console.log("Seeding permissions…");
  for (const code of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code },
      update: { description: label(code) },
      create: { code, description: label(code) },
    });
  }

  console.log("Seeding roles…");
  for (const code of SYSTEM_ROLES) {
    await prisma.role.upsert({
      where: { code },
      update: { label: ROLE_LABELS[code], isSystem: true },
      create: { code, label: ROLE_LABELS[code], isSystem: true },
    });
  }

  console.log("Wiring role -> permission grants…");
  const allPermissions = await prisma.permission.findMany();
  const permissionIdByCode = new Map(allPermissions.map((p) => [p.code as Permission, p.id]));
  const allRoles = await prisma.role.findMany();
  const roleIdByCode = new Map(allRoles.map((r) => [r.code as SystemRoleCode, r.id]));

  for (const roleCode of SYSTEM_ROLES) {
    const roleId = roleIdByCode.get(roleCode)!;
    const grants = ROLE_PERMISSIONS[roleCode];

    for (const permissionCode of grants) {
      const permissionId = permissionIdByCode.get(permissionCode);
      if (!permissionId) {
        throw new Error(`Seed error: permission "${permissionCode}" is not in the catalog.`);
      }
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId, permissionId } },
        update: {},
        create: { roleId, permissionId },
      });
    }
  }

  console.log("Seeding commerce settings (Phase 5)…");
  // Placeholder rates only — pending docs/business-rules.md Q-19 (GST,
  // client's CA) and Q-20 (platform fee, commercial decision). See
  // src/server/lib/pricing-config.ts for how these are read, and
  // docs/adr/0013-commerce-money-math.md for the basis-points representation.
  const COMMERCE_SETTINGS: { key: string; valueJson: number; description: string }[] = [
    { key: "commerce.gst_rate_bps", valueJson: 1800, description: "GST rate — 18% placeholder (Q-19)" },
    {
      key: "commerce.platform_fee_rate_bps",
      valueJson: 500,
      description: "Platform fee rate — 5% placeholder (Q-20)",
    },
  ];
  for (const setting of COMMERCE_SETTINGS) {
    await prisma.systemSetting.upsert({
      where: { key: setting.key },
      update: {},
      create: {
        key: setting.key,
        valueJson: setting.valueJson,
        valueType: "NUMBER",
        updatedBy: null,
      },
    });
  }

  console.log("Done.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
