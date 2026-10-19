/**
 * Removes ALL demo and test data so the database is ready for production: every member, vendor, listing,
 * order, invoice, wallet and ledger row, every audit and notification row, every login (the Supabase Auth
 * accounts), and every uploaded file. What stays: the one account you name with --keep-email (with its
 * roles), the roles and permissions, and the settings. The rows are removed for good and cannot be
 * brought back, so this script does nothing unless you ask it to.
 *
 *   DRY RUN (default, deletes nothing, prints what WOULD be removed):
 *   npx tsx --conditions=react-server --env-file=.env --env-file=.env.local scripts/reset-demo-data.ts --keep-email=admin@justreference.in
 *
 *   REAL RUN (only after reading the dry run, and after taking a backup):
 *   npx tsx --conditions=react-server --env-file=.env --env-file=.env.local scripts/reset-demo-data.ts --keep-email=admin@justreference.in --execute --confirm=DELETE-ALL-DEMO-DATA
 *
 * Extra tables to keep can be named with --keep-tables=table_a,table_b (for example --keep-tables=
 * product_categories,product_subcategories,service_categories,service_subcategories,project_categories,
 * project_subcategories to keep the category lists). Counters restart, so the first real member, order,
 * invoice and listing start again from 1.
 */
import { prisma } from "@/server/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { recordAudit } from "@/server/domain/audit/record";

/** Tables that are never emptied: who may do what, and the site's settings. `users` is handled on its own. */
const ALWAYS_KEEP = new Set([
  "users",
  "roles",
  "permissions",
  "role_permissions",
  "user_roles",
  "system_settings",
]);
const BUCKETS = ["catalog-public", "invoices-private", "kyc-private", "message-docs"];
const CONFIRM_TOKEN = "DELETE-ALL-DEMO-DATA";

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit?.slice(name.length + 3);
}
const flag = (name: string) => process.argv.includes(`--${name}`);
const quote = (identifier: string) => `"${identifier.replace(/"/g, '""')}"`;

async function listAllFiles(
  storage: ReturnType<typeof createAdminClient>["storage"],
  bucket: string,
  prefix = "",
): Promise<string[]> {
  const files: string[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await storage.from(bucket).list(prefix, { limit: 100, offset });
    if (error) throw new Error(`Could not list ${bucket}/${prefix}: ${error.message}`);
    if (!data || data.length === 0) break;
    for (const entry of data) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      // A folder has no id in a Supabase listing.
      if (entry.id === null) files.push(...(await listAllFiles(storage, bucket, path)));
      else files.push(path);
    }
    if (data.length < 100) break;
    offset += 100;
  }
  return files;
}

async function main() {
  const keepEmail = arg("keep-email")?.trim().toLowerCase();
  if (!keepEmail) {
    console.error("Say which account to keep, e.g. --keep-email=admin@justreference.in");
    process.exit(1);
  }
  const execute = flag("execute");
  if (execute && arg("confirm") !== CONFIRM_TOKEN) {
    console.error(`To really delete, add --confirm=${CONFIRM_TOKEN}`);
    process.exit(1);
  }

  const keeper = await prisma.user.findUnique({
    where: { email: keepEmail },
    select: {
      id: true,
      email: true,
      userRoles: { where: { revokedAt: null }, select: { role: { select: { code: true } } } },
    },
  });
  if (!keeper) {
    console.error(`No account with the email ${keepEmail}, so nothing was done.`);
    process.exit(1);
  }
  const keeperRoles = keeper.userRoles.map((r) => r.role.code);
  if (!keeperRoles.includes("SUPER_ADMIN")) {
    console.error(
      `${keepEmail} is not a Super Admin (roles: ${keeperRoles.join(", ") || "none"}). Refusing, so nobody is locked out.`,
    );
    process.exit(1);
  }

  const extraKeep = new Set(
    (arg("keep-tables") ?? "")
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean),
  );
  const tables = (
    await prisma.$queryRawUnsafe<{ table_name: string }[]>(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name",
    )
  ).map((r) => r.table_name);
  const unknownKeep = [...extraKeep].filter((t) => !tables.includes(t));
  if (unknownKeep.length > 0) {
    console.error(`--keep-tables names tables that do not exist: ${unknownKeep.join(", ")}`);
    process.exit(1);
  }

  const toEmpty = tables.filter((t) => !ALWAYS_KEEP.has(t) && !extraKeep.has(t));
  const counts: { table: string; rows: number }[] = [];
  for (const table of toEmpty) {
    const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*)::bigint AS count FROM ${quote(table)}`,
    );
    counts.push({ table, rows: Number(rows[0]?.count ?? 0n) });
  }

  const otherUsers = await prisma.user.findMany({
    where: { id: { not: keeper.id } },
    select: {
      email: true,
      userRoles: { where: { revokedAt: null }, select: { role: { select: { code: true } } } },
    },
    orderBy: { email: "asc" },
  });

  const supabase = createAdminClient();
  const authUsers: { id: string; email: string | undefined }[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(`Could not list sign-in accounts: ${error.message}`);
    authUsers.push(...data.users.map((u) => ({ id: u.id, email: u.email })));
    if (data.users.length < 200) break;
  }
  const authToDelete = authUsers.filter((u) => u.id !== keeper.id);

  const files: Record<string, string[]> = {};
  for (const bucket of BUCKETS) {
    try {
      files[bucket] = await listAllFiles(supabase.storage, bucket);
    } catch {
      files[bucket] = [];
    }
  }

  console.log(execute ? "=== REAL RUN ===" : "=== DRY RUN (nothing is deleted) ===");
  console.log(`\nKEEP account : ${keeper.email}  (roles: ${keeperRoles.join(", ")})`);
  console.log(
    `KEEP tables  : users (that one account), ${[...ALWAYS_KEEP].filter((t) => t !== "users").join(", ")}${extraKeep.size ? ", " + [...extraKeep].join(", ") : ""}`,
  );
  console.log(
    `\nTables that will be EMPTIED (${counts.filter((c) => c.rows > 0).length} of ${counts.length} have rows):`,
  );
  for (const c of counts)
    if (c.rows > 0) console.log(`  ${String(c.rows).padStart(7)}  ${c.table}`);
  console.log(
    `\nAccounts that will be DELETED (${otherUsers.length}) from the database and from sign-in (${authToDelete.length}):`,
  );
  for (const u of otherUsers)
    console.log(`  ${u.email}  [${u.userRoles.map((r) => r.role.code).join(", ") || "no role"}]`);
  console.log("\nUploaded files that will be DELETED:");
  for (const bucket of BUCKETS)
    console.log(`  ${String(files[bucket]!.length).padStart(7)}  ${bucket}`);
  const triggers = await prisma.$queryRawUnsafe<{ table_name: string; trigger_name: string }[]>(
    "SELECT c.relname AS table_name, t.tgname AS trigger_name FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND NOT t.tgisinternal ORDER BY 1, 2",
  );
  console.log(
    `\nDatabase triggers that could block a delete: ${
      triggers.length === 0
        ? "none"
        : triggers.map((t) => `${t.table_name}.${t.trigger_name}`).join(", ")
    }`,
  );
  console.log("\nCounters (member IDs, listing IDs, order and invoice numbers) restart from 1.");

  if (!execute) {
    console.log(
      "\nNothing was changed. Take a backup, read the lists above, then add --execute --confirm=" +
        CONFIRM_TOKEN,
    );
    await prisma.$disconnect();
    return;
  }

  // 1. Files first, then sign-in accounts, then the database, so a failure never leaves files without owners
  //    that cannot be found again.
  for (const bucket of BUCKETS) {
    const paths = files[bucket]!;
    for (let i = 0; i < paths.length; i += 100) {
      const { error } = await supabase.storage.from(bucket).remove(paths.slice(i, i + 100));
      if (error) throw new Error(`Could not delete files from ${bucket}: ${error.message}`);
    }
  }
  for (const user of authToDelete) {
    const { error } = await supabase.auth.admin.deleteUser(user.id);
    if (error)
      throw new Error(`Could not delete the sign-in account ${user.email}: ${error.message}`);
  }

  await prisma.$transaction(async (tx) => {
    if (toEmpty.length > 0) {
      await tx.$executeRawUnsafe(
        `TRUNCATE TABLE ${toEmpty.map(quote).join(", ")} RESTART IDENTITY CASCADE`,
      );
    }
    await tx.$executeRawUnsafe(`DELETE FROM user_roles WHERE user_id <> $1::uuid`, keeper.id);
    // The kept account's own role rows may point at an account that is about to go.
    await tx.$executeRawUnsafe(
      `UPDATE user_roles SET granted_by = NULL WHERE granted_by IS NOT NULL AND granted_by <> $1::uuid`,
      keeper.id,
    );
    await tx.$executeRawUnsafe(
      `UPDATE user_roles SET revoked_by = NULL WHERE revoked_by IS NOT NULL AND revoked_by <> $1::uuid`,
      keeper.id,
    );
    await tx.$executeRawUnsafe(
      `UPDATE system_settings SET updated_by = NULL WHERE updated_by IS NOT NULL AND updated_by <> $1::uuid`,
      keeper.id,
    );
    await tx.$executeRawUnsafe(`DELETE FROM users WHERE id <> $1::uuid`, keeper.id);
  });

  await recordAudit({
    actorId: keeper.id,
    action: "DEMO_DATA_RESET",
    entityType: "system_settings",
    entityId: keeper.id,
    after: {
      keptAccount: keeper.email,
      emptiedTables: counts
        .filter((c) => c.rows > 0)
        .map((c) => ({ table: c.table, rows: c.rows })),
      deletedAccounts: otherUsers.length,
      deletedFiles: Object.fromEntries(BUCKETS.map((b) => [b, files[b]!.length])),
    },
  });
  console.log("\nDone. Demo data removed. Check the site, then sign in as " + keeper.email);
  await prisma.$disconnect();
}

void main();
