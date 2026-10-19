/**
 * Emergency recovery: removes every two-step (authenticator app) factor from one account, so its owner
 * can sign in with a password again and set up a new authenticator. Use it when a staff member loses
 * their phone and nobody else can sign in to help. It signs that account out of every session.
 *
 *   npx tsx --conditions=react-server --env-file=.env --env-file=.env.local scripts/reset-two-step.ts someone@example.com
 *
 * Prints how many factors it removed. Records the reset in the audit log, with no actor (a person at the
 * server ran it).
 */
import { prisma } from "@/server/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/server/domain/audit/record";

async function main() {
  const email = process.argv[2]?.trim().toLowerCase();
  if (!email) {
    console.error("Usage: reset-two-step.ts <email>");
    process.exit(1);
  }
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) {
    console.error(`No account with the email ${email}.`);
    process.exit(1);
  }

  const supabase = createAdminClient();
  const listed = await supabase.auth.admin.mfa.listFactors({ userId: user.id });
  if (listed.error) throw new Error(`Could not list factors: ${listed.error.message}`);

  let removed = 0;
  for (const factor of listed.data.factors) {
    const result = await supabase.auth.admin.mfa.deleteFactor({ id: factor.id, userId: user.id });
    if (result.error) throw new Error(`Could not remove a factor: ${result.error.message}`);
    removed += 1;
  }
  if (removed > 0) {
    await recordAudit({
      actorId: null,
      action: "TWO_STEP_RESET_BY_SERVER",
      entityType: "users",
      entityId: user.id,
      after: { removedFactors: removed },
    });
  }
  console.log(`Removed ${removed} two-step factor(s) from ${email}.`);
  await prisma.$disconnect();
}

void main();
