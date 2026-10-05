import "server-only";
import { getAuthSession, type AuthSession } from "@/server/auth/session";
import { evaluateAuthorization, type AuthorizeOptions } from "@/server/auth/evaluate-authorization";
import type { Permission } from "@/server/auth/permissions";

export type { AuthorizeOptions } from "@/server/auth/evaluate-authorization";

/**
 * The single, shared authorization gate — see docs/rbac.md §1 and
 * docs/architecture.md §7. Every protected Server Action / Route Handler
 * calls this; no route re-implements these checks by hand. Resolves the
 * real session (Supabase + Prisma) and delegates the actual decision to
 * evaluateAuthorization() (see tests/unit/authorize.test.ts).
 */
export async function authorize(
  permission: Permission,
  options: AuthorizeOptions = {},
): Promise<AuthSession> {
  const session = await getAuthSession();
  return evaluateAuthorization(session, permission, options);
}

/** Convenience check that does not throw — for conditionally rendering UI. */
export async function hasPermission(permission: Permission): Promise<boolean> {
  const session = await getAuthSession();
  if (!session || session.status === "BLOCKED") return false;
  return session.permissions.has(permission);
}
