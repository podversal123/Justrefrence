/**
 * Real-database check of the role, admin-account, vendor and sign-in repository functions that the admin
 * and seller actions use (the unit tests run them against a fake client). Creates throwaway rows with the
 * marker domain @repotest.justreference.test and removes them again, even on failure.
 *
 *   npx tsx --conditions=react-server --env-file=.env --env-file=.env.local scripts/verify-account-repositories.ts
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/server/lib/prisma";
import {
  countActiveSuperAdmins,
  createRoleGrant,
  createRoleWithPermissions,
  findActiveRoleGrant,
  findPermissionsByCodes,
  findRoleById,
  findRoleGrantWithRole,
  findRoleRowByCode,
  findRoleWithPermissions,
  replaceRolePermissions,
  revokeRoleGrant,
} from "@/server/repositories/role-write-repository";
import {
  changeVendorApprovalStatus,
  createPendingVendorProfile,
  createVendorAccount,
  findVendorApplication,
  findVendorProfileById,
  resubmitRejectedVendorProfile,
  updateVendorProfileDetails,
} from "@/server/repositories/vendor-write-repository";
import {
  createStaffUser,
  findMemberModerationState,
  findUserByEmail,
  findUserById,
  findUserFullName,
  findUserIdByPhone,
  setLoginAttemptState,
  setUserFullName,
} from "@/server/repositories/identity/user-repository";
import { getVendorApprovalStatus } from "@/server/repositories/vendor-repository";

const DOMAIN = "@repotest.justreference.test";
const ROLE_CODE = "REPOTEST_ROLE";
let passed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${label}`);
  } else {
    failures.push(label);
    console.log(`FAIL  ${label}`, detail ?? "");
  }
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: DOMAIN } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  const role = await prisma.role.findUnique({ where: { code: ROLE_CODE } });
  await prisma.userRole.deleteMany({
    where: { OR: [{ userId: { in: ids } }, ...(role ? [{ roleId: role.id }] : [])] },
  });
  await prisma.vendorProfile.deleteMany({ where: { userId: { in: ids } } });
  await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  if (role) {
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.role.delete({ where: { id: role.id } });
  }
}

async function main() {
  await cleanup();

  // ---------------------------------------------------------------- roles and permissions
  const permissions = await findPermissionsByCodes(["product:read", "audit:read", "no:such:code"]);
  check("permissions are found by code (unknown codes are simply absent)", permissions.length === 2, permissions.length);

  const role = await createRoleWithPermissions({
    code: ROLE_CODE,
    label: "Repo test role",
    permissionIds: permissions.map((p) => p.id),
  });
  check("a custom role is created and is not a system role", role.code === ROLE_CODE && role.isSystem === false);
  check("it is found by code and by id", (await findRoleRowByCode(ROLE_CODE))?.id === role.id && (await findRoleById(role.id))?.id === role.id);
  const withPerms = await findRoleWithPermissions(role.id);
  check("it holds exactly the two permissions", withPerms?.rolePermissions.length === 2, withPerms?.rolePermissions.length);

  await replaceRolePermissions(role.id, permissions.slice(0, 1).map((p) => p.id));
  check(
    "replacing permissions leaves exactly the new set",
    (await findRoleWithPermissions(role.id))?.rolePermissions.length === 1,
  );
  await replaceRolePermissions(role.id, []);
  check("replacing with nothing clears them", (await findRoleWithPermissions(role.id))?.rolePermissions.length === 0);

  // ---------------------------------------------------------------- admin account and grants
  const adminId = randomUUID();
  const adminEmail = `admin-${adminId.slice(0, 8)}${DOMAIN}`;
  const boss = await prisma.user.create({
    data: { id: randomUUID(), email: `boss-${randomUUID().slice(0, 8)}${DOMAIN}`, fullName: "Boss", status: "ACTIVE" },
  });
  // All or nothing: a role that does not exist makes the second insert fail, so no user may remain.
  let failedAsExpected = false;
  await createStaffUser({
    id: adminId,
    email: adminEmail,
    fullName: "Repo Admin",
    phone: null,
    createdBy: boss.id,
    roleId: randomUUID(),
  }).catch(() => {
    failedAsExpected = true;
  });
  check(
    "a failed account creation leaves no user behind (all or nothing)",
    failedAsExpected && (await prisma.user.findUnique({ where: { id: adminId } })) === null,
  );

  await createStaffUser({
    id: adminId,
    email: adminEmail,
    fullName: "Repo Admin",
    phone: "9000000001",
    createdBy: boss.id,
    roleId: role.id,
  });
  const staff = await findUserById(adminId);
  check("the admin account is created pending verification with its phone", staff?.status === "PENDING_VERIFICATION" && staff.phone === "9000000001");
  check("it can be found by email and by phone", (await findUserByEmail(adminEmail))?.id === adminId && (await findUserIdByPhone("9000000001"))?.id === adminId);
  const grant = await findActiveRoleGrant(adminId, role.id);
  check("the role was granted in the same step, by the creator", grant?.grantedBy === boss.id);
  check("no active grant of a role they do not hold", (await findActiveRoleGrant(boss.id, role.id)) === null);

  const second = await createRoleGrant(boss.id, role.id, boss.id);
  check("a role can be granted and read back with its role", (await findRoleGrantWithRole(second.id))?.role.code === ROLE_CODE);
  await revokeRoleGrant(second.id, adminId);
  const revoked = await findRoleGrantWithRole(second.id);
  check("revoking stamps who and when, and the grant stops being active", revoked?.revokedBy === adminId && revoked.revokedAt !== null && (await findActiveRoleGrant(boss.id, role.id)) === null);
  check("the Super Admin count reads without error", (await countActiveSuperAdmins()) >= 0);

  await setUserFullName(adminId, "Renamed Admin");
  check("a name change is read back", (await findUserFullName(adminId))?.fullName === "Renamed Admin");

  await setLoginAttemptState(adminId, { failedLoginAttempts: 3, lockedUntil: new Date(Date.now() + 60_000) });
  const locked = await findUserById(adminId);
  check("the sign-in lock state is written", locked?.failedLoginAttempts === 3 && locked.lockedUntil !== null);
  await setLoginAttemptState(adminId, { failedLoginAttempts: 0, lockedUntil: null });
  check("and cleared again", (await findUserById(adminId))?.failedLoginAttempts === 0);
  check("moderation state reads for a user without a member profile", (await findMemberModerationState(adminId))?.memberProfile === null);

  // ---------------------------------------------------------------- vendor account and approval
  const vendorRole = await findRoleRowByCode("VENDOR");
  if (!vendorRole) {
    console.log("SKIP  vendor checks: the VENDOR role is not seeded in this database");
  } else {
    const vid = randomUUID();
    await createVendorAccount({
      userId: vid,
      email: `vendor-${vid.slice(0, 8)}${DOMAIN}`,
      fullName: "Repo Vendor",
      createdBy: boss.id,
      roleId: vendorRole.id,
      businessName: "Repo Traders",
      phone: "9000000002",
    });
    const app = await findVendorApplication(vid);
    check("a vendor account makes the user, the VENDOR role and a PENDING profile together", app?.approvalStatus === "PENDING" && (await findActiveRoleGrant(vid, vendorRole.id)) !== null);
    check("the approval status can be read on its own", (await getVendorApprovalStatus(app!.id))?.approvalStatus === "PENDING");

    // approval by a stale reader loses; the right one wins and grants the role exactly once
    const stale = await changeVendorApprovalStatus({
      vendorProfileId: app!.id,
      expectedStatus: "REJECTED",
      status: "APPROVED",
      reason: undefined,
      decidedBy: boss.id,
      applicantUserId: vid,
    });
    check("a decision based on an outdated status changes nothing", stale === false && (await findVendorProfileById(app!.id))?.approvalStatus === "PENDING");
    const results = await Promise.all(
      [1, 2].map(() =>
        changeVendorApprovalStatus({
          vendorProfileId: app!.id,
          expectedStatus: "PENDING",
          status: "APPROVED",
          reason: undefined,
          decidedBy: boss.id,
          applicantUserId: vid,
        }),
      ),
    );
    check("two simultaneous approvals: exactly one wins", results.filter(Boolean).length === 1, results);
    const approved = await findVendorProfileById(app!.id);
    check("the vendor is APPROVED with the decider recorded", approved?.approvalStatus === "APPROVED" && approved.approvedBy === boss.id && approved.rejectedReason === null);
    const grants = await prisma.userRole.count({ where: { userId: vid, roleId: vendorRole.id, revokedAt: null } });
    check("the VENDOR role is held exactly once", grants === 1, grants);

    await updateVendorProfileDetails(app!.id, { businessName: "Repo Traders Ltd", phone: "9000000003", telephone: null, gstin: null, pan: null });
    check("own details can be updated", (await findVendorProfileById(app!.id))?.businessName === "Repo Traders Ltd");

    // member applying to become a seller
    const mid = await prisma.user.create({
      data: { id: randomUUID(), email: `member-${randomUUID().slice(0, 8)}${DOMAIN}`, fullName: "Applicant", status: "ACTIVE" },
    });
    const created = await createPendingVendorProfile(mid.id, { businessName: "Applicant Co", phone: "9000000004", gstin: null });
    check("an application is created PENDING", (await findVendorApplication(mid.id))?.approvalStatus === "PENDING");
    check("a pending application cannot be resubmitted", (await resubmitRejectedVendorProfile(created.id, { businessName: "X", phone: "9000000005", gstin: null })) === 0);
    await changeVendorApprovalStatus({ vendorProfileId: created.id, expectedStatus: "PENDING", status: "REJECTED", reason: "Incomplete papers", decidedBy: boss.id, applicantUserId: mid.id });
    const rejected = await findVendorProfileById(created.id);
    check("a rejection keeps its reason and grants no role", rejected?.approvalStatus === "REJECTED" && rejected.rejectedReason === "Incomplete papers" && (await findActiveRoleGrant(mid.id, vendorRole.id)) === null);
    check("a rejected application can be resubmitted once, clearing the reason", (await resubmitRejectedVendorProfile(created.id, { businessName: "Applicant Co 2", phone: "9000000004", gstin: null })) === 1 && (await findVendorProfileById(created.id))?.rejectedReason === null);
  }
}

main()
  .catch((error) => {
    failures.push("script crashed");
    console.error(error);
  })
  .finally(async () => {
    await cleanup().catch((error) => console.error("cleanup failed", error));
    console.log(`\n${passed} passed, ${failures.length} failed`);
    await prisma.$disconnect();
    process.exit(failures.length ? 1 : 0);
  });
