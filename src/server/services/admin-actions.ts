"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/server/lib/prisma";
import { authorize } from "@/server/auth/authorize";
import { recordAudit } from "@/server/domain/audit/record";
import { logger } from "@/server/lib/logger";
import { changePasswordSchema, createAdminSchema, updateProfileSchema } from "@/lib/schemas/admin";
import type { ApiResult } from "@/lib/api-response";

/**
 * Admin account management Server Actions — see docs/rbac.md (`user:create`)
 * and the Phase 2 brief's ADMIN feature list. Layering: this file is the
 * application-service layer (auth + validation + orchestration); Prisma
 * calls are inline here rather than a separate repository because each is a
 * single-row read/write, not a query with search/filter/sort logic worth
 * splitting out (contrast with vendor-repository.ts).
 */

function requestId() {
  return crypto.randomUUID();
}

export async function createAdminAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<{ userId: string }>> {
  let session;
  try {
    session = await authorize("user:create");
  } catch {
    return {
      success: false,
      error: { code: "FORBIDDEN", message: "You don't have permission to create admin accounts." },
      meta: { requestId: requestId() },
    };
  }

  const parsed = createAdminSchema.safeParse({
    email: formData.get("email"),
    fullName: formData.get("fullName"),
    roleId: formData.get("roleId"),
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

  const role = await prisma.role.findUnique({ where: { id: parsed.data.roleId } });
  if (!role) {
    return {
      success: false,
      error: { code: "NOT_FOUND", message: "That role no longer exists." },
      meta: { requestId: requestId() },
    };
  }

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) {
    return {
      success: false,
      error: { code: "CONFLICT", message: "An account with that email already exists." },
      meta: { requestId: requestId() },
    };
  }

  const supabaseAdmin = createAdminClient();
  const invited = await supabaseAdmin.auth.admin.inviteUserByEmail(parsed.data.email, {
    data: { full_name: parsed.data.fullName },
  });

  if (invited.error || !invited.data.user) {
    logger.error("admin_invite_failed", { message: invited.error?.message });
    return {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "Could not send the invite email. Try again shortly.",
      },
      meta: { requestId: requestId() },
    };
  }

  const newUserId = invited.data.user.id;

  try {
    await prisma.$transaction(async (tx) => {
      await tx.user.create({
        data: {
          id: newUserId,
          email: parsed.data.email,
          fullName: parsed.data.fullName,
          status: "PENDING_VERIFICATION",
          createdBy: session.userId,
        },
      });
      await tx.userRole.create({
        data: { userId: newUserId, roleId: role.id, grantedBy: session.userId },
      });
    });
  } catch (error) {
    // Compensate: don't leave an orphaned Supabase Auth user with no local row.
    await supabaseAdmin.auth.admin.deleteUser(newUserId).catch(() => {});
    logger.error("admin_create_db_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Could not create the admin account." },
      meta: { requestId: requestId() },
    };
  }

  await recordAudit({
    actorId: session.userId,
    action: "ADMIN_CREATED",
    entityType: "users",
    entityId: newUserId,
    after: { email: parsed.data.email, fullName: parsed.data.fullName, role: role.code },
  });

  revalidatePath("/admin/admins");

  return { success: true, data: { userId: newUserId }, meta: { requestId: requestId() } };
}

export async function updateProfileAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error: { code: "UNAUTHENTICATED", message: "Please sign in again." },
      meta: { requestId: requestId() },
    };
  }

  const parsed = updateProfileSchema.safeParse({ fullName: formData.get("fullName") });
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Enter a valid name.",
        details: parsed.error.flatten(),
      },
      meta: { requestId: requestId() },
    };
  }

  const before = await prisma.user.findUnique({
    where: { id: user.id },
    select: { fullName: true },
  });

  await prisma.user.update({
    where: { id: user.id },
    data: { fullName: parsed.data.fullName },
  });

  await recordAudit({
    actorId: user.id,
    action: "PROFILE_UPDATED",
    entityType: "users",
    entityId: user.id,
    before: { fullName: before?.fullName ?? null },
    after: { fullName: parsed.data.fullName },
  });

  revalidatePath("/profile");

  return { success: true, data: null, meta: { requestId: requestId() } };
}

export async function changePasswordAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user?.email) {
    return {
      success: false,
      error: { code: "UNAUTHENTICATED", message: "Please sign in again." },
      meta: { requestId: requestId() },
    };
  }

  const parsed = changePasswordSchema.safeParse({
    currentPassword: formData.get("currentPassword"),
    newPassword: formData.get("newPassword"),
    confirmNewPassword: formData.get("confirmNewPassword"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Check the password requirements below.",
        details: parsed.error.flatten(),
      },
      meta: { requestId: requestId() },
    };
  }

  // Re-authenticate with the current password before allowing the change —
  // never trust that a live session alone is enough for a security-relevant
  // credential change (see docs/security.md §2).
  const reauth = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  });

  if (reauth.error) {
    return {
      success: false,
      error: { code: "UNAUTHENTICATED", message: "Your current password is incorrect." },
      meta: { requestId: requestId() },
    };
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword });

  if (error) {
    return {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Could not update your password. Try again." },
      meta: { requestId: requestId() },
    };
  }

  await recordAudit({
    actorId: user.id,
    action: "PASSWORD_CHANGED",
    entityType: "users",
    entityId: user.id,
  });

  return { success: true, data: null, meta: { requestId: requestId() } };
}
