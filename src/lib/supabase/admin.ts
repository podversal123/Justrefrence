import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — full access, bypasses RLS. Used ONLY by
 * admin-initiated user-provisioning actions (create admin, create vendor)
 * that need `auth.admin.*` (creating a user without the self-service signup
 * flow, sending an invite/reset link). Never imported by request-scoped
 * session code — see docs/security.md §6.
 *
 * A fresh client per call (not a module-level singleton) since this wraps
 * a server-only secret and each call site should make its use explicit.
 */
export function createAdminClient() {
  const url = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];

  if (!url || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY / NEXT_PUBLIC_SUPABASE_URL are not set — required for admin-initiated user creation. See .env.example.",
    );
  }

  return createSupabaseClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
