/**
 * The pure authorization decision core — deliberately has NO "server-only"
 * import and no I/O, so it can be unit-tested directly (see
 * tests/unit/authorize.test.ts) without pulling in Prisma/Supabase or
 * Next.js's react-server module-resolution condition. authorize.ts (the
 * server-only I/O wrapper that resolves the actual session) is the only
 * caller in application code — see docs/rbac.md §1.
 */
import { AccountBlockedError, AuthenticationError, AuthorizationError } from "@/server/lib/errors";
import type { AuthSession } from "@/server/auth/session";
import type { Permission } from "@/server/auth/permissions";

export interface AuthorizeOptions {
  /**
   * If the resource being acted on has an owner, pass that owner's user id.
   * A caller who holds the permission but isn't the owner is still denied
   * unless they also hold the corresponding `*:any` override permission
   * (e.g. `order:read:any`), passed as `overridePermission`.
   */
  resourceOwnerId?: string;
  overridePermission?: Permission;
  /**
   * Business-rule/state gate — e.g. "is this order still cancellable".
   * Return `true` to allow, or a human-readable reason string to deny.
   */
  businessRuleCheck?: () => true | string;
}

/**
 * Runs, in order: authentication -> account status -> permission ->
 * resource ownership -> business-rule state.
 */
export function evaluateAuthorization(
  session: AuthSession | null,
  permission: Permission,
  options: AuthorizeOptions = {},
): AuthSession {
  if (!session) {
    throw new AuthenticationError();
  }

  if (session.status === "BLOCKED") {
    throw new AccountBlockedError();
  }

  const hasDirectPermission = session.permissions.has(permission);
  const hasOverridePermission = options.overridePermission
    ? session.permissions.has(options.overridePermission)
    : false;

  if (!hasDirectPermission && !hasOverridePermission) {
    throw new AuthorizationError();
  }

  if (options.resourceOwnerId && options.resourceOwnerId !== session.userId) {
    if (!hasOverridePermission) {
      throw new AuthorizationError();
    }
  }

  if (options.businessRuleCheck) {
    const result = options.businessRuleCheck();
    if (result !== true) {
      throw new AuthorizationError(result);
    }
  }

  return session;
}
