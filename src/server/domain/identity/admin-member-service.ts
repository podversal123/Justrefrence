// Orchestration layer, same convention as registration-service.ts: no "server-only"
// import here, every dependency below already carries its own guard.
import { prisma } from "@/server/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { findRoleByCode } from "@/server/repositories/role-repository";
import {
  createMemberProfile,
  createReferralRelationship,
  getMemberProfileByReferralCode,
} from "@/server/repositories/identity/member-repository";
import { sendWelcomeNotification } from "@/server/domain/identity/notify";
import { recordAudit } from "@/server/domain/audit/record";
import { ConflictError, ValidationError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import type { AdminCreateMemberInput } from "@/lib/schemas/member";
import { generateTemporaryPassword } from "@/server/lib/temporary-password";

const CUSTOMER_ROLE_CODE = "CUSTOMER";

export interface AdminRegisteredMember {
  userId: string;
  memberId: string;
  email: string;
  temporaryPassword: string;
}

/**
 * "New Registration" from the admin panel (workflow doc, Admin Panel week 8):
 * creates a confirmed Supabase user + local ACTIVE account + member profile
 * (with the referral link if a referral code is given) + CUSTOMER role, in one
 * go, without the OTP step, because an admin is vouching for this person.
 */
export async function registerMemberByAdmin(
  input: AdminCreateMemberInput,
  actorId: string,
): Promise<AdminRegisteredMember> {
  const referrer = input.referralCode
    ? await getMemberProfileByReferralCode(input.referralCode)
    : null;
  if (input.referralCode && !referrer) {
    throw new ValidationError("That referral code isn't valid.", { path: ["referralCode"] });
  }

  if (await prisma.user.findUnique({ where: { email: input.email }, select: { id: true } })) {
    throw new ConflictError("An account with that email already exists.");
  }
  if (
    input.phone &&
    (await prisma.user.findUnique({ where: { phone: input.phone }, select: { id: true } }))
  ) {
    throw new ConflictError("An account with that mobile number already exists.");
  }

  const customerRole = await findRoleByCode(CUSTOMER_ROLE_CODE);
  if (!customerRole) throw new Error(`Seed error: "${CUSTOMER_ROLE_CODE}" role is missing.`);

  const temporaryPassword = generateTemporaryPassword();
  const supabaseAdmin = createAdminClient();
  const created = await supabaseAdmin.auth.admin.createUser({
    email: input.email,
    password: temporaryPassword,
    ...(input.phone ? { phone: input.phone, phone_confirm: false } : {}),
    email_confirm: true,
    user_metadata: { full_name: input.fullName },
  });
  if (created.error || !created.data.user) {
    logger.error("admin_register_member_supabase_failed", { message: created.error?.message });
    throw new ConflictError("Could not create that account. Check the details and try again.");
  }
  const userId = created.data.user.id;

  let profile;
  try {
    profile = await prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id: userId,
          email: input.email,
          phone: input.phone ?? null,
          fullName: input.fullName,
          status: "ACTIVE",
          emailVerifiedAt: new Date(),
        },
      });
      const member = await createMemberProfile(tx, {
        userId,
        referredByUserId: referrer?.userId ?? null,
        parentReferralPath: referrer?.referralPath ?? null,
      });
      if (referrer) {
        await createReferralRelationship(tx, { memberId: member.id, referrerId: referrer.id });
      }
      await tx.userRole.create({ data: { userId, roleId: customerRole.id } });
      return member;
    });
  } catch (error) {
    // Don't leave an orphaned Supabase Auth user with no local row.
    await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
    logger.error("admin_register_member_db_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }

  await recordAudit({
    actorId,
    action: "MEMBER_REGISTERED_BY_ADMIN",
    entityType: "users",
    entityId: userId,
    after: { memberId: profile.memberId, referredBy: referrer?.memberId ?? null },
  });

  await sendWelcomeNotification({
    userId,
    email: input.email,
    fullName: input.fullName,
    memberId: profile.memberId ?? "",
    referralCode: profile.referralCode ?? "",
  });

  return { userId, memberId: profile.memberId ?? "", email: input.email, temporaryPassword };
}
