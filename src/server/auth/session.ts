import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/server/lib/prisma";
import type { Permission, RoleCode } from "@/server/auth/permissions";

export interface AuthSession {
  userId: string;
  email: string;
  fullName: string | null;
  status: "ACTIVE" | "BLOCKED" | "PENDING_VERIFICATION";
  roles: RoleCode[];
  permissions: Set<Permission>;
  /** Cheap nav-gating shortcut — avoids every page re-querying for this. */
  hasVendorProfile: boolean;
  /** Null for non-vendors — used for catalog ownership checks (docs/adr/0011 §ownership). */
  vendorProfileId: string | null;
}

/**
 * Resolves the current request's authenticated session: verifies the
 * Supabase JWT (`getUser()`, never the unverified `getSession()`), then
 * loads roles/permissions from Postgres via Prisma. Requires the Node.js
 * runtime (Prisma's `pg` driver adapter does not run on Edge) — call this
 * from Server Components, Server Actions, or Route Handlers, never from
 * src/middleware.ts.
 *
 * `cache()` de-dupes this across a single render pass so multiple
 * components asking "who's logged in" don't each re-hit Supabase + Postgres.
 */
export const getAuthSession = cache(async (): Promise<AuthSession | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      userRoles: {
        where: { revokedAt: null },
        include: {
          role: {
            include: {
              rolePermissions: { include: { permission: true } },
            },
          },
        },
      },
      vendorProfile: { select: { id: true } },
    },
  });

  // A Supabase Auth user without a corresponding `users` row is either a
  // signup that hasn't finished provisioning, or a data inconsistency —
  // either way, treat as unauthenticated rather than guessing a role.
  if (!dbUser) return null;

  const roles = dbUser.userRoles.map((ur) => ur.role.code as RoleCode);
  const permissions = new Set<Permission>(
    dbUser.userRoles.flatMap((ur) =>
      ur.role.rolePermissions.map((rp) => rp.permission.code as Permission),
    ),
  );

  return {
    userId: dbUser.id,
    email: dbUser.email,
    fullName: dbUser.fullName,
    status: dbUser.status,
    roles,
    permissions,
    hasVendorProfile: dbUser.vendorProfile !== null,
    vendorProfileId: dbUser.vendorProfile?.id ?? null,
  };
});
