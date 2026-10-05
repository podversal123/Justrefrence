/**
 * Creates two real, sign-in-able demo accounts so every panel can be shown
 * and tested end to end (the admin account comes from bootstrap-admin.ts):
 *
 *   - a VENDOR  (approved vendor profile)  -> vendor panel
 *   - a CUSTOMER (member profile, referred by the demo member "Aarav") -> customer panel
 *
 * Same approach as bootstrap-admin.ts: Supabase Admin API creates confirmed
 * users with known passwords (no email provider is needed), then the
 * matching `users` / role / profile rows are written. Local/demo use only.
 *
 *   npx tsx scripts/create-demo-logins.ts            # create (safe to re-run)
 *   npx tsx scripts/create-demo-logins.ts --remove   # delete both accounts
 *
 * Run scripts/seed-demo-catalog.ts first so the demo referrer exists.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { buildReferralPath, formatMemberId } from "../src/server/domain/identity/member-id";

const ACCOUNTS = {
  vendor: {
    email: "vendor.demo@example.com",
    password: "Vendor@12345",
    fullName: "Demo Vendor",
    role: "VENDOR",
  },
  customer: {
    email: "customer.demo@example.com",
    password: "Customer@12345",
    fullName: "Demo Customer",
    role: "CUSTOMER",
  },
} as const;

async function main() {
  const supabaseUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const databaseUrl = process.env["DATABASE_URL"];
  if (!supabaseUrl || !serviceRoleKey || !databaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / DATABASE_URL in env.");
  }
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

  try {
    if (process.argv.includes("--remove")) {
      for (const account of Object.values(ACCOUNTS)) {
        const user = await prisma.user.findUnique({ where: { email: account.email } });
        if (!user) continue;
        const profile = await prisma.memberProfile.findUnique({ where: { userId: user.id } });
        if (profile) {
          await prisma.referralRelationship.deleteMany({ where: { memberId: profile.id } });
          await prisma.memberProfile.delete({ where: { id: profile.id } });
        }
        await prisma.userRole.deleteMany({ where: { userId: user.id } });
        await prisma.vendorProfile.deleteMany({ where: { userId: user.id } });
        await prisma.user.delete({ where: { id: user.id } });
        await supabase.auth.admin.deleteUser(user.id).catch(() => undefined);
        console.log("Removed", account.email);
      }
      return;
    }

    const referrer = await prisma.memberProfile.findFirst({
      where: { user: { email: "aarav@demo.justreference.test" } },
      select: { id: true, userId: true, referralPath: true },
    });

    for (const account of Object.values(ACCOUNTS)) {
      if (await prisma.user.findUnique({ where: { email: account.email } })) {
        console.log("Already exists:", account.email);
        continue;
      }
      const role = await prisma.role.findFirst({ where: { code: account.role } });
      if (!role) throw new Error(`${account.role} role not found — run the RBAC seed first.`);

      const created = await supabase.auth.admin.createUser({
        email: account.email,
        password: account.password,
        email_confirm: true,
        user_metadata: { full_name: account.fullName },
      });
      if (created.error || !created.data.user) {
        throw new Error(`Supabase Auth user creation failed: ${created.error?.message}`);
      }
      const userId = created.data.user.id;

      try {
        await prisma.$transaction(async (tx) => {
          await tx.user.create({
            data: {
              id: userId,
              email: account.email,
              fullName: account.fullName,
              status: "ACTIVE",
              emailVerifiedAt: new Date(),
            },
          });
          await tx.userRole.create({ data: { userId, roleId: role.id, grantedBy: userId } });

          if (account.role === "VENDOR") {
            await tx.vendorProfile.create({
              data: {
                userId,
                businessName: "Demo Vendor Traders",
                approvalStatus: "APPROVED",
                approvedAt: new Date(),
              },
            });
          } else {
            const profile = await tx.memberProfile.create({
              data: { userId, referredByUserId: referrer?.userId ?? null, referralPath: "" },
            });
            const memberId = formatMemberId(profile.memberSeq);
            await tx.memberProfile.update({
              where: { id: profile.id },
              data: {
                memberId,
                referralCode: memberId,
                referralPath: buildReferralPath(referrer?.referralPath ?? null, profile.id),
              },
            });
            if (referrer) {
              await tx.referralRelationship.create({
                data: { memberId: profile.id, referrerId: referrer.id, level: 1, changedAt: new Date() },
              });
            }
          }
        });
      } catch (error) {
        await supabase.auth.admin.deleteUser(userId).catch(() => undefined);
        throw error;
      }
      console.log("Created", account.role, "account:", account.email);
    }
    console.log("Passwords are the constants at the top of scripts/create-demo-logins.ts.");
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
