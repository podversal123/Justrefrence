# ADR-0005: Permission-based RBAC with defense-in-depth RLS, not role checks in code

## Status
Accepted

## Context
The system has six roles today but the brief explicitly requires permission-based authorization ("`product:create`" style), configurable admin sub-roles (Q-30), and per-resource ownership checks (a vendor must not see another vendor's data). Supabase offers Row-Level Security, which could theoretically carry the whole authorization burden.

## Decision
- Authorization is **permission-based**: code calls `requirePermission(session, "wallet:withdraw")`, never `if (role === "CUSTOMER")`. Roles are just named bundles of permissions (`role_permissions`), editable by `SUPER_ADMIN` without a deploy.
- A single shared `authorize()` helper runs all five checks (authentication, role, permission, resource ownership, business-rule state + account status) for every protected Server Action/Route Handler — no route reimplements this logic.
- Supabase RLS is enabled deny-by-default on every table as **defense-in-depth**, not as the primary authorization mechanism. The application's Prisma client uses the service role and makes its own authorization decisions in the service layer; RLS exists to contain the blast radius of a future bug (e.g., an accidental direct-from-client Supabase call) rather than to encode the full "role + permission + ownership + business-state" logic RLS policies are poorly suited to expressing legibly.

## Consequences
- One place to audit for "is this endpoint actually protected" (the `authorize()` call sites), rather than scattered `if` statements or a large, hard-to-review set of RLS policies.
- Adding a new admin sub-role (Q-30) is a data change (new row in `roles` + `role_permissions`), not a code change.
- Slightly more setup work up front (permission catalog + matrix in [rbac.md](../rbac.md)) — accepted, since it's exactly what the brief requires and it pays for itself the first time a permission needs to move between roles.

## Alternatives considered
- **RLS as the primary authorization layer** — rejected: expressing "commission:approve requires FINANCE role AND the commission is still PENDING AND the actor isn't blocked" cleanly and auditably in SQL policy language, kept in sync with application-level state machines, is materially harder to review than TypeScript service code, for no compensating benefit given the app never grants direct client access to the database.
- **Simple role-string checks** (`if role === 'ADMIN'`) — rejected: does not support Q-30's requirement for configurable admin sub-roles/permission bundles without code changes.
