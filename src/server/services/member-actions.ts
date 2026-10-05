"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/server/lib/prisma";
import {
  addressSchema,
  bankAccountSchema,
  memberDetailsSchema,
  mobileLoginRequestSchema,
  mobileLoginVerifySchema,
  registerSchema,
  verifyRegistrationSchema,
} from "@/lib/schemas/member";
import {
  confirmRegistration,
  startRegistration,
} from "@/server/domain/identity/registration-service";
import { requestOtp } from "@/server/domain/identity/otp-service";
import {
  confirmMobileLoginOtp,
  requestMobileLoginOtp,
} from "@/server/domain/identity/mobile-login-service";
import { updateMemberDetails } from "@/server/repositories/identity/member-repository";
import { upsertAddress } from "@/server/repositories/identity/address-repository";
import { upsertBankAccount } from "@/server/repositories/identity/bank-repository";
import { encryptField } from "@/server/domain/identity/encryption";
import { maskBankAccountNumber } from "@/server/domain/identity/masking";
import { getFieldEncryptionKey } from "@/server/lib/field-encryption";
import { recordAudit } from "@/server/domain/audit/record";
import { AppError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import type { ApiResult } from "@/lib/api-response";

/**
 * Member registration, mobile-OTP login, and self-service profile Server
 * Actions — see docs/adr/0012-otp-session-bridge.md and the Phase 4 brief.
 * Profile-editing actions here never trust a client-supplied user/member id
 * (same discipline as vendor-actions.ts's updateVendorProfileAction) — the
 * target is always derived from the caller's own authenticated session.
 */

function requestId() {
  return crypto.randomUUID();
}

async function clientIp(): Promise<string | null> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

function failureFrom(error: unknown): ApiResult<never> {
  if (error instanceof AppError) {
    return {
      success: false,
      error: { code: error.code, message: error.message, details: error.details },
      meta: { requestId: requestId() },
    };
  }
  logger.error("member_action_unexpected_error", {
    message: error instanceof Error ? error.message : String(error),
  });
  return {
    success: false,
    error: { code: "INTERNAL_ERROR", message: "Something went wrong. Please try again." },
    meta: { requestId: requestId() },
  };
}

// ---------------------------------------------------------------------------
// Registration
// ---------------------------------------------------------------------------

export async function requestRegistrationAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  const parsed = registerSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    password: formData.get("password"),
    confirmPassword: formData.get("confirmPassword"),
    channel: formData.get("channel"),
    referralCode: formData.get("referralCode") || undefined,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Check the fields below.",
        details: parsed.error.flatten(),
      },
      meta: { requestId: requestId() },
    };
  }

  const ip = await clientIp();

  let result;
  try {
    result = await startRegistration(parsed.data, ip);
  } catch (error) {
    return failureFrom(error);
  }

  const params = new URLSearchParams({ userId: result.userId, channel: result.channel });
  if (parsed.data.referralCode) params.set("ref", parsed.data.referralCode);
  redirect(`/register/verify?${params.toString()}`);
}

export async function resendRegistrationOtpAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<{ maskedDestination: string }>> {
  const userId = String(formData.get("userId") ?? "");
  const channel = String(formData.get("channel") ?? "");

  if (!userId || !["EMAIL", "SMS", "WHATSAPP"].includes(channel)) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Missing registration details." },
      meta: { requestId: requestId() },
    };
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== "PENDING_VERIFICATION") {
    return {
      success: false,
      error: {
        code: "NOT_FOUND",
        message: "That registration session has expired. Please start again.",
      },
      meta: { requestId: requestId() },
    };
  }

  const destination = channel === "EMAIL" ? user.email : (user.phone ?? "");

  try {
    const { maskedDestination } = await requestOtp({
      userId,
      destination,
      channel: channel as "EMAIL" | "SMS" | "WHATSAPP",
      purpose: "REGISTRATION",
    });
    return { success: true, data: { maskedDestination }, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom(error);
  }
}

export async function confirmRegistrationAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  const parsed = verifyRegistrationSchema.safeParse({
    userId: formData.get("userId"),
    code: formData.get("code"),
    referralCode: formData.get("referralCode") || undefined,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Enter the 6-digit code.",
        details: parsed.error.flatten(),
      },
      meta: { requestId: requestId() },
    };
  }

  try {
    await confirmRegistration(parsed.data);
  } catch (error) {
    return failureFrom(error);
  }

  redirect("/dashboard");
}

// ---------------------------------------------------------------------------
// Mobile-number OTP login (docs/business-rules.md Q-32/Q-33)
// ---------------------------------------------------------------------------

export async function requestMobileLoginOtpAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<{ message: string }>> {
  const parsed = mobileLoginRequestSchema.safeParse({ phone: formData.get("phone") });

  const generic: ApiResult<{ message: string }> = {
    success: true,
    data: { message: "If that number is registered, a code has been sent." },
    meta: { requestId: requestId() },
  };

  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Enter a valid mobile number." },
      meta: { requestId: requestId() },
    };
  }

  try {
    await requestMobileLoginOtp(parsed.data.phone);
  } catch (error) {
    // Rate-limit errors are the one case worth surfacing distinctly — the
    // rest stays generic to avoid account enumeration.
    if (error instanceof AppError && error.code === "RATE_LIMITED") {
      return failureFrom(error);
    }
    logger.error("mobile_login_otp_request_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
  }

  return generic;
}

export async function confirmMobileLoginOtpAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  const parsed = mobileLoginVerifySchema.safeParse({
    phone: formData.get("phone"),
    code: formData.get("code"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Enter the 6-digit code.",
        details: parsed.error.flatten(),
      },
      meta: { requestId: requestId() },
    };
  }

  const ip = await clientIp();

  try {
    await confirmMobileLoginOtp(parsed.data.phone, parsed.data.code, ip);
  } catch (error) {
    return failureFrom(error);
  }

  redirect("/dashboard");
}

// ---------------------------------------------------------------------------
// Self-service profile (KYC, addresses, bank) — always scoped to the
// caller's own session, never a client-supplied id.
// ---------------------------------------------------------------------------

async function requireUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

export async function updateMemberDetailsAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  const userId = await requireUserId();
  if (!userId) {
    return {
      success: false,
      error: { code: "UNAUTHENTICATED", message: "Please sign in again." },
      meta: { requestId: requestId() },
    };
  }

  const parsed = memberDetailsSchema.safeParse({
    fullName: formData.get("fullName"),
    dob: formData.get("dob") || undefined,
    pan: formData.get("pan") || undefined,
    gstin: formData.get("gstin") || undefined,
    websiteUrl: formData.get("websiteUrl") || undefined,
    socialLinks: formData.get("socialLinks") || undefined,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Check the fields below.",
        details: parsed.error.flatten(),
      },
      meta: { requestId: requestId() },
    };
  }

  await updateMemberDetails(userId, {
    fullName: parsed.data.fullName,
    dob: parsed.data.dob ? new Date(parsed.data.dob) : undefined,
    pan: parsed.data.pan,
    gstin: parsed.data.gstin,
    websiteUrl: parsed.data.websiteUrl,
    socialLinks: parsed.data.socialLinks,
  });

  await recordAudit({
    actorId: userId,
    action: "MEMBER_DETAILS_UPDATED",
    entityType: "member_profiles",
    entityId: userId,
  });

  revalidatePath("/profile");
  return { success: true, data: null, meta: { requestId: requestId() } };
}

export async function upsertAddressAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  const userId = await requireUserId();
  if (!userId) {
    return {
      success: false,
      error: { code: "UNAUTHENTICATED", message: "Please sign in again." },
      meta: { requestId: requestId() },
    };
  }

  const parsed = addressSchema.safeParse({
    type: formData.get("type"),
    line1: formData.get("line1"),
    line2: formData.get("line2") || undefined,
    city: formData.get("city"),
    state: formData.get("state"),
    postalCode: formData.get("postalCode"),
    country: formData.get("country") || "IN",
  });

  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Check the address fields.",
        details: parsed.error.flatten(),
      },
      meta: { requestId: requestId() },
    };
  }

  await upsertAddress(userId, parsed.data);

  revalidatePath("/profile");
  return { success: true, data: null, meta: { requestId: requestId() } };
}

export async function upsertBankAccountAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  const userId = await requireUserId();
  if (!userId) {
    return {
      success: false,
      error: { code: "UNAUTHENTICATED", message: "Please sign in again." },
      meta: { requestId: requestId() },
    };
  }

  const parsed = bankAccountSchema.safeParse({
    accountHolderName: formData.get("accountHolderName"),
    accountNumber: formData.get("accountNumber"),
    ifsc: formData.get("ifsc"),
    branchAddress: formData.get("branchAddress") || undefined,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Check the bank details.",
        details: parsed.error.flatten(),
      },
      meta: { requestId: requestId() },
    };
  }

  const key = getFieldEncryptionKey();
  await upsertBankAccount({
    userId,
    accountHolderName: parsed.data.accountHolderName,
    accountNoEncrypted: encryptField(parsed.data.accountNumber, key),
    accountNoMasked: maskBankAccountNumber(parsed.data.accountNumber),
    ifsc: parsed.data.ifsc,
    branchAddress: parsed.data.branchAddress ?? null,
  });

  await recordAudit({
    actorId: userId,
    action: "BANK_ACCOUNT_UPDATED",
    entityType: "bank_accounts",
    entityId: userId,
    after: {
      accountNoMasked: maskBankAccountNumber(parsed.data.accountNumber),
      ifsc: parsed.data.ifsc,
    },
  });

  revalidatePath("/profile");
  return { success: true, data: null, meta: { requestId: requestId() } };
}
