/**
 * Static permission catalog — see docs/rbac.md §3. This is the same list
 * seeded into the `permissions` table (prisma/seed.ts); the string union
 * here gives compile-time checking to every `authorize()` call site so a
 * typo'd permission code is a type error, not a silent always-deny bug.
 *
 * Only identity/RBAC/audit/platform permissions are "live" in Phase 1 (the
 * modules actually built). The rest of the catalog is listed for completeness
 * and seeded as data now, ready for Phase 2+ to depend on without a schema
 * change — see docs/rbac.md for the full role x permission matrix.
 */
export const PERMISSIONS = [
  // Identity & access
  "user:create",
  "user:read",
  "user:update",
  "user:block",
  "user:unblock",
  "role:read",
  "role:assign",
  "permission:read",
  "permission:update",
  "vendor:apply",
  "vendor:approve",
  "vendor:reject",
  "vendor:suspend",

  // Catalog
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

  // Cart & orders
  "cart:manage",
  "order:create",
  "order:read",
  "order:read:any",
  "order:update_status",
  "order:cancel",
  "invoice:read",
  "invoice:generate",

  // Payments
  "payment:read",
  "payment:webhook_process",

  // Referral & commission
  "referral:read",
  "referral:read:any",
  "referral:create",
  "referral:repoint",
  "commission:read",
  "commission:read:any",
  "commission:approve",
  "commission_rule:read",
  "commission_rule:update",

  // Wallet & payout
  "wallet:read",
  "wallet:read:any",
  "wallet:topup",
  "wallet:transfer",
  "wallet:withdraw",
  "payout:request",
  "payout:approve",
  "payout:reject",
  "payout:record_transfer",
  "wallet_pin:set",
  "bank_account:verify",

  // E-pin & subscription
  "epin:generate",
  "epin:read",
  "epin:read:any",
  "epin:redeem",
  "epin:revoke",
  "subscription_plan:manage",
  "subscription:read",

  // Coupons & rewards
  "coupon:create",
  "coupon:update",
  "coupon:read",
  "coupon:redeem",
  "reward:read",
  "reward:grant",
  "reward:read:any",

  // Tax
  "tds_rule:manage",
  "tds:read",
  "tds:read:any",
  "tds_report:export",
  "gst_rule:manage",

  // Bidding
  "requirement:create",
  "requirement:read",
  "bid:submit",
  "bid:accept",
  "bid:read:any",

  // Messaging, support, content
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
  "feedback:submit",
  "feedback:read",

  // Members & moderation
  "member:read",
  "member:read:any",
  "member:block",
  "member:unblock",
  "member:filter_list",

  // Platform
  "settings:read",
  "settings:update",
  "maintenance:toggle",
  "audit:read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/**
 * The 6 roles seeded at install time (`isSystem = true` — see
 * docs/adr/0010-vendor-profile-and-dynamic-roles.md). Roles are otherwise
 * dynamic — an admin can create additional custom roles composed from the
 * PERMISSIONS catalog above — so `RoleCode` is `string`, not a fixed union.
 * SYSTEM_ROLES exists for the seed script and for UI that must not allow
 * renaming/deleting one of these six.
 */
export const SYSTEM_ROLES = [
  "SUPER_ADMIN",
  "ADMIN",
  "FINANCE",
  "SUPPORT",
  "VENDOR",
  "CUSTOMER",
] as const;

export type SystemRoleCode = (typeof SYSTEM_ROLES)[number];

/** Any role code — one of the 6 system roles, or a custom admin-created role. */
export type RoleCode = string;
