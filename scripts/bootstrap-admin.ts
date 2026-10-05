/**
 * One-off bootstrap script: creates the FIRST Super Admin account, since the
 * normal createAdminAction() requires an already-authenticated Super Admin
 * (chicken-and-egg) and uses an email-invite flow that needs a working email
 * provider. This uses the Supabase Admin API to create a confirmed user with
 * a known password directly, then mirrors createAdminAction()'s DB writes.
 *
 * Run once: npx tsx scripts/bootstrap-admin.ts
 * Not part of the app's action layer — delete after first use if desired.
 */
import { config as loadEnv } from "dotenv";
loadEnv({ path: ".env" });
loadEnv({ path: ".env.local", override: true });
import { createClient } from "@supabase/supabase-js";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const EMAIL = "admin@justreference.in";
const PASSWORD = "Admin@12345";
const FULL_NAME = "Super Admin";

async function main() {
  const supabaseUrl = process.env["NEXT_PUBLIC_SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  const databaseUrl = process.env["DATABASE_URL"];

  if (!supabaseUrl || !serviceRoleKey || !databaseUrl) {
    throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / DATABASE_URL in env.");
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });

  const existing = await prisma.user.findUnique({ where: { email: EMAIL } });
  if (existing) {
    console.log(`User ${EMAIL} already exists locally (id: ${existing.id}). Nothing to do.`);
    await prisma.$disconnect();
    return;
  }

  console.log("Creating Supabase Auth user...");
  const created = await supabaseAdmin.auth.admin.createUser({
    email: EMAIL,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: FULL_NAME },
  });

  if (created.error || !created.data.user) {
    throw new Error(`Supabase Auth user creation failed: ${created.error?.message}`);
  }

  const userId = created.data.user.id;
  console.log(`Supabase Auth user created: ${userId}`);

  const role = await prisma.role.findFirst({ where: { code: "SUPER_ADMIN" } });
  if (!role) {
    throw new Error("SUPER_ADMIN role not found — did the seed script run?");
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id: userId,
          email: EMAIL,
          fullName: FULL_NAME,
          status: "ACTIVE",
          emailVerifiedAt: new Date(),
          createdBy: null,
        },
      });
      await tx.userRole.create({
        data: { userId, roleId: role.id, grantedBy: userId },
      });
    });
  } catch (error) {
    await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
    throw error;
  }

  console.log("---");
  console.log("Super Admin account created successfully:");
  console.log(`  Email:    ${EMAIL}`);
  console.log(`  Password: ${PASSWORD}`);
  console.log("---");

  await prisma.$disconnect();
}

main().catch((err) => {
  console.error("Bootstrap failed:", err);
  process.exit(1);
});
