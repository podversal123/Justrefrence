"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { prisma } from "@/server/lib/prisma";
import { authorize } from "@/server/auth/authorize";
import { recordAudit } from "@/server/domain/audit/record";
import { logger } from "@/server/lib/logger";
import { getVendorProfileByUserId } from "@/server/repositories/vendor-repository";
import {
  createVendorSchema,
  updateVendorProfileSchema,
  updateVendorStatusSchema,
} from "@/lib/schemas/vendor";
import { VendorApprovalStatus } from "@/generated/prisma/enums";
import type { ApiResult } from "@/lib/api-response";

function requestId() {
  return crypto.randomUUID();
}

/** Only these transitions are allowed — see docs/adr/0008-explicit-state-machines.md. */
const VENDOR_STATUS_TRANSITIONS: Record<VendorApprovalStatus, VendorApprovalStatus[]> = {
  PENDING: [VendorApprovalStatus.APPROVED, VendorApprovalStatus.REJECTED],
  APPROVED: [VendorApprovalStatus.SUSPENDED],
  REJECTED: [VendorApprovalStatus.APPROVED],
  SUSPENDED: [VendorApprovalStatus.APPROVED],
};

const STATUS_PERMISSION: Record<
  VendorApprovalStatus,
  "vendor:approve" | "vendor:reject" | "vendor:suspend"
> = {
  APPROVED: "vendor:approve",
  REJECTED: "vendor:reject",
  SUSPENDED: "vendor:suspend",
  PENDING: "vendor:approve",
};

export async function createVendorAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<{ userId: string }>> {
  let session;
  try {
    session = await authorize("user:create");
  } catch {
    return {
      success: false,
      error: { code: "FORBIDDEN", message: "You don't have permission to create vendors." },
      meta: { requestId: requestId() },
    };
  }

  const parsed = createVendorSchema.safeParse({
    email: formData.get("email"),
    businessName: formData.get("businessName"),
    fullName: formData.get("fullName"),
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

  const existing = await prisma.user.findUnique({ where: { email: parsed.data.email } });
  if (existing) {
    return {
      success: false,
      error: { code: "CONFLICT", message: "An account with that email already exists." },
      meta: { requestId: requestId() },
    };
  }

  const vendorRole = await prisma.role.findUnique({ where: { code: "VENDOR" } });
  if (!vendorRole) {
    return {
      success: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "The VENDOR role is not seeded. Run the seed script.",
      },
      meta: { requestId: requestId() },
    };
  }

  const supabaseAdmin = createAdminClient();
  const invited = await supabaseAdmin.auth.admin.inviteUserByEmail(parsed.data.email, {
    data: { full_name: parsed.data.fullName, business_name: parsed.data.businessName },
  });

  if (invited.error || !invited.data.user) {
    logger.error("vendor_invite_failed", { message: invited.error?.message });
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
        data: { userId: newUserId, roleId: vendorRole.id, grantedBy: session.userId },
      });
      await tx.vendorProfile.create({
        data: {
          userId: newUserId,
          businessName: parsed.data.businessName,
          approvalStatus: VendorApprovalStatus.PENDING,
        },
      });
    });
  } catch (error) {
    await supabaseAdmin.auth.admin.deleteUser(newUserId).catch(() => {});
    logger.error("vendor_create_db_failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return {
      success: false,
      error: { code: "INTERNAL_ERROR", message: "Could not create the vendor account." },
      meta: { requestId: requestId() },
    };
  }

  await recordAudit({
    actorId: session.userId,
    action: "VENDOR_CREATED",
    entityType: "vendor_profiles",
    entityId: newUserId,
    after: { email: parsed.data.email, businessName: parsed.data.businessName },
  });

  revalidatePath("/admin/vendors");

  return { success: true, data: { userId: newUserId }, meta: { requestId: requestId() } };
}

export async function updateVendorStatusAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  const vendorProfileId = String(formData.get("vendorProfileId") ?? "");

  const parsed = updateVendorStatusSchema.safeParse({
    status: formData.get("status"),
    reason: formData.get("reason") || undefined,
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

  const requiredPermission = STATUS_PERMISSION[parsed.data.status];

  let session;
  try {
    session = await authorize(requiredPermission);
  } catch {
    return {
      success: false,
      error: { code: "FORBIDDEN", message: "You don't have permission to change vendor status." },
      meta: { requestId: requestId() },
    };
  }

  const vendor = await prisma.vendorProfile.findUnique({ where: { id: vendorProfileId } });
  if (!vendor) {
    return {
      success: false,
      error: { code: "NOT_FOUND", message: "Vendor not found." },
      meta: { requestId: requestId() },
    };
  }

  const allowedNextStatuses = VENDOR_STATUS_TRANSITIONS[vendor.approvalStatus];
  if (!allowedNextStatuses.includes(parsed.data.status)) {
    return {
      success: false,
      error: {
        code: "CONFLICT",
        message: `Cannot move a vendor from ${vendor.approvalStatus} to ${parsed.data.status}.`,
      },
      meta: { requestId: requestId() },
    };
  }

  // Conditional on the status we validated the transition against — a
  // concurrent change makes this match 0 rows instead of being clobbered.
  const { count } = await prisma.vendorProfile.updateMany({
    where: { id: vendorProfileId, approvalStatus: vendor.approvalStatus },
    data: {
      approvalStatus: parsed.data.status,
      approvedBy: session.userId,
      approvedAt: new Date(),
      rejectedReason:
        parsed.data.status === VendorApprovalStatus.REJECTED ? parsed.data.reason : null,
    },
  });

  if (count === 0) {
    return {
      success: false,
      error: {
        code: "CONFLICT",
        message: "This vendor's status was changed by someone else. Refresh and try again.",
      },
      meta: { requestId: requestId() },
    };
  }

  await recordAudit({
    actorId: session.userId,
    action: `VENDOR_${parsed.data.status}`,
    entityType: "vendor_profiles",
    entityId: vendorProfileId,
    before: { approvalStatus: vendor.approvalStatus },
    after: { approvalStatus: parsed.data.status, reason: parsed.data.reason },
  });

  revalidatePath("/admin/vendors");
  revalidatePath(`/admin/vendors/${vendorProfileId}`);

  return { success: true, data: null, meta: { requestId: requestId() } };
}

/**
 * Self-service — a vendor edits their OWN business profile. Deliberately
 * takes no vendorProfileId from the client; it's always resolved from the
 * caller's own session, so there is no ID a vendor could substitute to
 * reach another vendor's row. See docs/rbac.md §1 and
 * tests/integration/vendor-service.test.ts for the cross-vendor-access test.
 */
export async function updateVendorProfileAction(
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

  const parsed = updateVendorProfileSchema.safeParse({
    businessName: formData.get("businessName"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Enter a valid business name.",
        details: parsed.error.flatten(),
      },
      meta: { requestId: requestId() },
    };
  }

  const vendorProfile = await getVendorProfileByUserId(user.id);
  if (!vendorProfile) {
    return {
      success: false,
      error: { code: "NOT_FOUND", message: "You don't have a vendor profile." },
      meta: { requestId: requestId() },
    };
  }

  await prisma.vendorProfile.update({
    where: { id: vendorProfile.id },
    data: { businessName: parsed.data.businessName },
  });

  await recordAudit({
    actorId: user.id,
    action: "VENDOR_PROFILE_UPDATED",
    entityType: "vendor_profiles",
    entityId: vendorProfile.id,
    before: { businessName: vendorProfile.businessName },
    after: { businessName: parsed.data.businessName },
  });

  revalidatePath("/vendor/profile");

  return { success: true, data: null, meta: { requestId: requestId() } };
}
