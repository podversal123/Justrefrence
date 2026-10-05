// No "server-only" import — orchestration layer; every dependency below
// (Prisma, Supabase admin client, repositories) already carries its own
// "server-only" guard. Kept importable from integration tests with those
// mocked, matching listing-service.ts's precedent — see
// tests/integration/registration-actions.test.ts.
import { prisma } from "@/server/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import { findRoleByCode } from "@/server/repositories/role-repository";
import {
  createMemberProfile,
  createReferralRelationship,
  getMemberProfileByReferralCode,
} from "@/server/repositories/identity/member-repository";
import { requestOtp, verifyOtp } from "@/server/domain/identity/otp-service";
import { mintSessionForVerifiedUser } from "@/server/domain/identity/session-bridge";
import { sendWelcomeNotification } from "@/server/domain/identity/notify";
import { recordAudit } from "@/server/domain/audit/record";
import { registrationRateLimiter } from "@/server/lib/rate-limit";
import { ConflictError, RateLimitedError, ValidationError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import type { RegisterInput } from "@/lib/schemas/member";

const CUSTOMER_ROLE_CODE = "CUSTOMER";

export interface StartRegistrationResult {
  userId: string;
  channel: RegisterInput["channel"];
  maskedDestination: string;
}

/**
 * Step 1 of registration: validate, create (or reuse a still-pending) local
 * account, and send the first OTP. The Supabase Auth user + local `users`
 * row are created here (status `PENDING_VERIFICATION`) rather than at
 * verify-time, so the password is set immediately and a re-attempted
 * registration for the same still-pending email just resends a code instead
 * of erroring — see docs/adr/0012-otp-session-bridge.md.
 */
export async function startRegistration(
  input: RegisterInput,
  ip: string | null,
): Promise<StartRegistrationResult> {
  const { allowed } = await registrationRateLimiter.consume(`register:${input.email}:${ip ?? "unknown"}`);
  if (!allowed) {
    throw new RateLimitedError("Too many registration attempts. Please try again later.");
  }

  if (input.referralCode) {
    const referrer = await getMemberProfileByReferralCode(input.referralCode);
    if (!referrer) {
      throw new ValidationError("That referral code isn't valid.", { path: ["referralCode"] });
    }
  }

  const existing = await prisma.user.findUnique({ where: { email: input.email } });

  let userId: string;
  if (existing) {
    if (existing.status !== "PENDING_VERIFICATION") {
      throw new ConflictError("An account with that email already exists. Please sign in.");
    }
    userId = existing.id;
    // Keep the local row in sync with the latest attempt's inputs (a
    // person may retry with a corrected phone number, name, etc. before
    // ever verifying).
    await prisma.user.update({
      where: { id: userId },
      data: { fullName: input.fullName, phone: input.phone },
    });
  } else {
    const supabaseAdmin = createAdminClient();
    const created = await supabaseAdmin.auth.admin.createUser({
      email: input.email,
      password: input.password,
      phone: input.phone,
      email_confirm: false,
      phone_confirm: false,
      user_metadata: { full_name: input.fullName },
    });

    if (created.error || !created.data.user) {
      logger.error("registration_supabase_create_failed", { message: created.error?.message });
      throw new ConflictError("Could not start registration with those details. Try again.");
    }

    userId = created.data.user.id;

    try {
      await prisma.user.create({
        data: {
          id: userId,
          email: input.email,
          phone: input.phone,
          fullName: input.fullName,
          status: "PENDING_VERIFICATION",
        },
      });
    } catch (error) {
      // Compensate: don't leave an orphaned Supabase Auth user with no local row.
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
      logger.error("registration_db_create_failed", {
        message: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  const destination = input.channel === "EMAIL" ? input.email : input.phone;
  const { maskedDestination } = await requestOtp({
    userId,
    destination,
    channel: input.channel,
    purpose: "REGISTRATION",
  });

  await recordAudit({
    actorId: null,
    action: "REGISTRATION_OTP_SENT",
    entityType: "users",
    entityId: userId,
    ip,
  });

  return { userId, channel: input.channel, maskedDestination };
}

export interface ConfirmRegistrationResult {
  email: string;
}

/**
 * Step 2: verify the code, then atomically activate the account, create the
 * member profile (memberId/referralCode/referralPath), link the referrer if
 * any, and grant the CUSTOMER role. Session minting and the welcome
 * notification happen after the transaction commits (I/O that must not
 * roll back a successful registration if it fails).
 */
export async function confirmRegistration(input: {
  userId: string;
  code: string;
  referralCode?: string | undefined;
}): Promise<ConfirmRegistrationResult> {
  const user = await prisma.user.findUnique({ where: { id: input.userId } });
  if (!user) {
    throw new ValidationError("Registration session not found. Please start again.");
  }

  await verifyOtp({ userId: input.userId, purpose: "REGISTRATION", code: input.code });

  const referrer = input.referralCode
    ? await getMemberProfileByReferralCode(input.referralCode)
    : null;
  if (input.referralCode && !referrer) {
    throw new ValidationError("That referral code isn't valid.", { path: ["referralCode"] });
  }

  const customerRole = await findRoleByCode(CUSTOMER_ROLE_CODE);
  if (!customerRole) {
    throw new Error(`Seed error: "${CUSTOMER_ROLE_CODE}" role is missing.`);
  }

  const memberProfile = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: input.userId },
      data: {
        status: "ACTIVE",
        emailVerifiedAt: new Date(),
      },
    });

    const created = await createMemberProfile(tx, {
      userId: input.userId,
      referredByUserId: referrer?.userId ?? null,
      parentReferralPath: referrer?.referralPath ?? null,
    });

    if (referrer) {
      await createReferralRelationship(tx, { memberId: created.id, referrerId: referrer.id });
    }

    await tx.userRole.create({
      data: { userId: input.userId, roleId: customerRole.id },
    });

    return created;
  });

  await recordAudit({
    actorId: input.userId,
    action: "MEMBER_REGISTERED",
    entityType: "users",
    entityId: input.userId,
    after: { memberId: memberProfile.memberId, referredBy: referrer?.memberId ?? null },
  });

  await sendWelcomeNotification({
    userId: input.userId,
    email: user.email,
    fullName: user.fullName ?? "there",
    memberId: memberProfile.memberId ?? "",
    referralCode: memberProfile.referralCode ?? "",
  });

  await mintSessionForVerifiedUser(user.email);

  return { email: user.email };
}
