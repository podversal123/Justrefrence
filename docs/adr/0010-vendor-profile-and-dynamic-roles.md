# ADR-0010: Phase 2 vendor profile hangs off `User` directly; roles become dynamic

## Status
Accepted

## Context
Two Phase 2 requirements don't fit the Phase 0 schema exactly as designed:

1. [database-tables.md §1](../database-tables.md#1-identity--access) defines `vendor_profiles.member_profile_id → member_profiles.id`, because a vendor is modeled as a capability layered onto a *member* (the referral/customer identity introduced in Phase 4). `member_profiles` doesn't exist yet — building it now, ahead of Phase 4, means either a throwaway table or prematurely deciding member-identifier/referral-code fields that are Phase 6's concern.
2. [rbac.md §2](../rbac.md#2-roles) and [ADR-0005](0005-rbac-model.md) describe roles as a **static** catalog (`SUPER_ADMIN, ADMIN, FINANCE, SUPPORT, VENDOR, CUSTOMER`), and `RoleCode` was typed as a fixed 6-value TypeScript union in Phase 1. Phase 2 explicitly asks for admin-facing **role management** — create role, assign, remove, manage permissions — which requires roles to be a genuinely dynamic, admin-editable set.

## Decision
1. `VendorProfile.userId` references `User.id` directly, not a `member_profiles` row. When Phase 4 introduces `member_profiles`, this FK is migrated to point through it (a straightforward `ALTER` + backfill, since every vendor is already a user) — this ADR is superseded at that point, not silently ignored.
2. `RoleCode` in `src/server/auth/permissions.ts` changes from a fixed union to `string`. The 6 original roles remain as named constants (`SYSTEM_ROLES`) used by the seed script and by any code that has a legitimate reason to special-case them. A new `Role.isSystem: Boolean` column (default `false`) marks the 6 seeded roles; the admin UI refuses to delete or rename a role where `isSystem = true`. A custom role can only be **composed from the existing fixed permission catalog** (`PERMISSIONS` in the same file) — "create role" never means "invent a new permission code," only "create a new named bundle of existing permissions."

## Consequences
- No code in the authorization path (`evaluateAuthorization`, `authorize`, nav filtering) pattern-matches exhaustively over role codes — everything already keys off **permissions**, per [ADR-0005](0005-rbac-model.md) — so loosening `RoleCode` to `string` is low-risk and required no changes outside `permissions.ts` and the `AuthSession` type.
- A custom role with no special-cased UI still works correctly: nav items and page access are filtered by permission code, so granting a custom role a permission like `ticket:respond` makes the relevant nav item appear automatically, with no per-role UI branching needed.
- "Remove role" (Phase 2's feature list) is implemented as **revoking a role from a user** (`user_roles.revokedAt`), not deleting the role definition itself — deleting a role definition that users still hold would silently strip their permissions with no audit-friendly trail. Role-definition deactivation, if ever needed, is a separate, not-yet-built action.

## Alternatives considered
- **Build `member_profiles` now, minimally** (just the identity fields, no referral fields) — rejected: still forces Phase 6 to either extend this table awkwardly or migrate it, and adds a table this phase's actual requirements (admin/vendor management) don't need.
- **Keep `RoleCode` a fixed union, model custom roles as a separate parallel concept** — rejected: doubles the RBAC model's surface area (two kinds of "role") for no real benefit, since the permission-based authorization core already treats all roles uniformly.
