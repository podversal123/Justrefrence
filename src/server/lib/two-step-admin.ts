import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Staff-side handling of someone else's two-step (authenticator app) factors, through Supabase's admin
 * API. Used when a person has lost their phone, so they can sign in with a password again and set up a
 * new authenticator. A session that is already signed in is NOT ended by this (checked against the
 * live Supabase project), so a possibly compromised account should be blocked as well.
 */

export async function countTwoStepFactors(userId: string): Promise<number> {
  const listed = await createAdminClient().auth.admin.mfa.listFactors({ userId });
  if (listed.error) throw new Error(`Could not read two-step status: ${listed.error.message}`);
  return listed.data.factors.length;
}

/** Removes every factor of the account and returns how many there were. */
export async function removeAllTwoStepFactors(userId: string): Promise<number> {
  const supabase = createAdminClient();
  const listed = await supabase.auth.admin.mfa.listFactors({ userId });
  if (listed.error) throw new Error(`Could not read two-step status: ${listed.error.message}`);
  for (const factor of listed.data.factors) {
    const removed = await supabase.auth.admin.mfa.deleteFactor({ id: factor.id, userId });
    if (removed.error) throw new Error(`Could not remove a factor: ${removed.error.message}`);
  }
  return listed.data.factors.length;
}
