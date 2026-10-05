// No "server-only" import — orchestration layer over the Supabase clients,
// which each carry their own guard (createAdminClient / createClient). See
// docs/adr/0012-otp-session-bridge.md for the full rationale.
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { InternalError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";

/**
 * Mints a real Supabase Auth session for `email` after OUR OWN OTP
 * verification has already succeeded (any channel — email, SMS, WhatsApp).
 * Writes the session cookie onto the current request via the request-scoped
 * server client (`@/lib/supabase/server`), exactly like a native
 * `signInWithPassword` call would.
 *
 * See docs/adr/0012-otp-session-bridge.md for why this is the only
 * Supabase-supported path for a session that our own (non-Supabase-native)
 * OTP flow controls.
 */
export async function mintSessionForVerifiedUser(email: string): Promise<void> {
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });

  if (error || !data.properties?.hashed_token) {
    logger.error("session_bridge_generate_link_failed", { message: error?.message });
    throw new InternalError("Could not complete sign-in. Please try again.");
  }

  const supabase = await createClient();
  const { error: verifyError } = await supabase.auth.verifyOtp({
    token_hash: data.properties.hashed_token,
    type: "magiclink",
  });

  if (verifyError) {
    logger.error("session_bridge_verify_failed", { message: verifyError.message });
    throw new InternalError("Could not complete sign-in. Please try again.");
  }
}
