"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { CATALOG_PUBLIC_TAG } from "@/server/domain/catalog/cache-tags";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { findRoleRowByCode } from "@/server/repositories/role-write-repository";
import { findUserByEmail } from "@/server/repositories/identity/user-repository";
import {
  changeVendorApprovalStatus,
  createVendorAccount,
  findVendorProfileById,
  updateVendorProfileDetails,
} from "@/server/repositories/vendor-write-repository";
import { authorize } from "@/server/auth/authorize";
import { recordAudit } from "@/server/domain/audit/record";
import { logger } from "@/server/lib/logger";
import { getVendorProfileByUserId } from "@/server/repositories/vendor-repository";
import { createNotification } from "@/server/repositories/identity/notification-repository";
import {
  adminUpdateVendorSchema,
  createVendorSchema,
  updateVendorProfileSchema,
  updateVendorStatusSchema,
} from "@/lib/schemas/vendor";
import { VendorApprovalStatus } from "@/generated/prisma/enums";
import type { ApiResult } from "@/lib/api-response";
import { failureFrom, validationFailure } from "@/server/lib/action-helpers";
import { submitChange } from "@/server/domain/approvals/change-service";
import { requestNoteSchema } from "@/lib/schemas/approvals";

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
    phone: formData.get("phone"),
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

  const existing = await findUserByEmail(parsed.data.email);
  if (existing) {
    return {
      success: false,
      error: { code: "CONFLICT", message: "An account with that email already exists." },
      meta: { requestId: requestId() },
    };
  }

  const vendorRole = await findRoleRowByCode("VENDOR");
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
    await createVendorAccount({
      userId: newUserId,
      email: parsed.data.email,
      fullName: parsed.data.fullName,
      createdBy: session.userId,
      roleId: vendorRole.id,
      businessName: parsed.data.businessName,
      phone: parsed.data.phone,
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

  const vendor = await findVendorProfileById(vendorProfileId);
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
  // Approving also gives the person the VENDOR role in the same transaction: a member who asked to
  // become a seller has no vendor permissions until this moment.
  const changed = await changeVendorApprovalStatus({
    vendorProfileId,
    expectedStatus: vendor.approvalStatus,
    status: parsed.data.status,
    reason: parsed.data.reason,
    decidedBy: session.userId,
    applicantUserId: vendor.userId,
  });

  if (!changed) {
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

  await tellApplicant(vendor.userId, parsed.data.status, parsed.data.reason);

  revalidatePath("/admin/vendors");
  revalidatePath(`/admin/vendors/${vendorProfileId}`);
  revalidatePath("/become-seller");
  revalidateTag(CATALOG_PUBLIC_TAG, { expire: 0 });

  return { success: true, data: null, meta: { requestId: requestId() } };
}

/** A courtesy message: failing to deliver it never undoes the decision. */
async function tellApplicant(userId: string, status: VendorApprovalStatus, reason?: string) {
  const type =
    status === VendorApprovalStatus.APPROVED
      ? "SELLER_APPROVED"
      : status === VendorApprovalStatus.REJECTED
        ? "SELLER_REJECTED"
        : null;
  if (!type) return;
  await createNotification({ userId, type, payload: reason ? { reason } : {} }).catch(
    () => undefined,
  );
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
    phone: formData.get("phone"),
    telephone: formData.get("telephone") || undefined,
    gstin: formData.get("gstin") || undefined,
    pan: formData.get("pan") || undefined,
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

  const vendorProfile = await getVendorProfileByUserId(user.id);
  if (!vendorProfile) {
    return {
      success: false,
      error: { code: "NOT_FOUND", message: "You don't have a vendor profile." },
      meta: { requestId: requestId() },
    };
  }

  const next = parsed.data;
  await updateVendorProfileDetails(vendorProfile.id, {
    businessName: next.businessName,
    phone: next.phone,
    telephone: next.telephone ?? null,
    gstin: next.gstin ?? null,
    pan: next.pan ?? null,
  });

  // Log which fields changed, never the values (phone numbers and PAN are personal data).
  const changedFields = (
    [
      ["businessName", vendorProfile.businessName, next.businessName],
      ["phone", vendorProfile.phone, next.phone],
      ["telephone", vendorProfile.telephone, next.telephone],
      ["gstin", vendorProfile.gstin, next.gstin],
      ["pan", vendorProfile.pan, next.pan],
    ] as const
  )
    .filter(([, before, after]) => (before ?? "") !== (after ?? ""))
    .map(([field]) => field);

  await recordAudit({
    actorId: user.id,
    action: "VENDOR_PROFILE_UPDATED",
    entityType: "vendor_profiles",
    entityId: vendorProfile.id,
    after: { changedFields },
  });

  revalidatePath("/vendor/profile");

  return { success: true, data: null, meta: { requestId: requestId() } };
}

export interface VendorChangeOutcome {
  /** APPLIED: live now. SUBMITTED: waiting for a Super Admin to approve it. */
  mode: "APPLIED" | "SUBMITTED";
}

/**
 * An admin editing a vendor's business details. A Super Admin's edit is saved at once; an Admin's
 * edit becomes a request that a Super Admin approves (see domain/approvals), and the vendor's live
 * details stay as they are until then.
 */
export async function updateVendorByAdminAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<VendorChangeOutcome>> {
  let session;
  try {
    session = await authorize("vendor:update:any");
  } catch (error) {
    return failureFrom(
      "admin_update_vendor_denied",
      error,
      "You don't have permission to edit vendors.",
    );
  }

  const parsed = adminUpdateVendorSchema.safeParse({
    vendorProfileId: formData.get("vendorProfileId"),
    businessName: formData.get("businessName"),
    phone: formData.get("phone"),
    telephone: formData.get("telephone") || undefined,
    gstin: formData.get("gstin") || undefined,
    pan: formData.get("pan") || undefined,
  });
  if (!parsed.success) return validationFailure("Check the fields below.", parsed.error);
  const note = requestNoteSchema.safeParse(formData.get("note") ?? undefined);

  try {
    const { vendorProfileId, ...details } = parsed.data;
    const result = await submitChange({
      entityType: "VENDOR_PROFILE",
      entityId: vendorProfileId,
      proposed: {
        businessName: details.businessName,
        phone: details.phone,
        telephone: details.telephone ?? null,
        gstin: details.gstin ?? null,
        pan: details.pan ?? null,
      },
      actorId: session.userId,
      canApplyDirect: session.permissions.has("change:apply_direct"),
      note: note.success ? note.data : undefined,
    });
    revalidatePath(`/admin/vendors/${vendorProfileId}`);
    revalidatePath("/admin/vendors");
    revalidatePath("/admin/approvals");
    revalidateTag(CATALOG_PUBLIC_TAG, { expire: 0 });
    return { success: true, data: { mode: result.mode }, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom("admin_update_vendor_failed", error, "Could not update that vendor.");
  }
}
