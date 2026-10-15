"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/server/auth/authorize";
import { prisma } from "@/server/lib/prisma";
import { recordAudit } from "@/server/domain/audit/record";
import { sellerApplicationSchema } from "@/lib/schemas/vendor";
import { createNotification } from "@/server/repositories/identity/notification-repository";
import { userIdsWithPermission } from "@/server/repositories/ads/ad-repository";
import { failureFrom, requestId, validationFailure } from "@/server/lib/action-helpers";
import { ConflictError } from "@/server/lib/errors";
import { VendorApprovalStatus } from "@/generated/prisma/enums";
import type { ApiResult } from "@/lib/api-response";

const TAG = "seller_application_failed";

/**
 * A member's own request to start selling. It only creates a PENDING vendor profile: the VENDOR
 * role, and with it every seller permission, is given when the Super Admin approves (see
 * updateVendorStatusAction). The applicant is always the signed-in person, never an id from the form.
 */
export async function requestSellerAccessAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("vendor:apply");
  } catch (error) {
    return failureFrom(TAG, error, "You can't apply to become a seller with this account.");
  }

  const parsed = sellerApplicationSchema.safeParse({
    businessName: formData.get("businessName"),
    phone: formData.get("phone"),
    gstin: formData.get("gstin") ?? undefined,
  });
  if (!parsed.success) return validationFailure("Check the fields below.", parsed.error);

  try {
    const existing = await prisma.vendorProfile.findUnique({
      where: { userId: session.userId },
      select: { id: true, approvalStatus: true },
    });

    const data = {
      businessName: parsed.data.businessName,
      phone: parsed.data.phone,
      gstin: parsed.data.gstin || null,
    };

    let vendorProfileId: string;
    if (!existing) {
      const created = await prisma.vendorProfile.create({
        data: { userId: session.userId, approvalStatus: VendorApprovalStatus.PENDING, ...data },
        select: { id: true },
      });
      vendorProfileId = created.id;
    } else if (existing.approvalStatus === VendorApprovalStatus.REJECTED) {
      // A rejected request can be sent again with corrected details.
      const { count } = await prisma.vendorProfile.updateMany({
        where: { id: existing.id, approvalStatus: VendorApprovalStatus.REJECTED },
        data: { ...data, approvalStatus: VendorApprovalStatus.PENDING, rejectedReason: null },
      });
      if (count === 0) throw new ConflictError("Your request was changed. Refresh and try again.");
      vendorProfileId = existing.id;
    } else if (existing.approvalStatus === VendorApprovalStatus.PENDING) {
      throw new ConflictError("Your request is already with our team.");
    } else {
      throw new ConflictError("You already have a seller account.");
    }

    await recordAudit({
      actorId: session.userId,
      action: "SELLER_APPLIED",
      entityType: "vendor_profiles",
      entityId: vendorProfileId,
      after: { businessName: data.businessName },
    });

    // Tell everyone who can approve sellers. A failed message never undoes the request.
    const approvers = await userIdsWithPermission("vendor:approve").catch(() => [] as string[]);
    await Promise.all(
      approvers.map((userId) =>
        createNotification({
          userId,
          type: "SELLER_REQUEST",
          payload: { businessName: data.businessName, vendorProfileId },
        }).catch(() => undefined),
      ),
    );

    revalidatePath("/become-seller");
    revalidatePath("/admin/vendors");
    return { success: true, data: null, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom(TAG, error, "Could not send your request. Please try again.");
  }
}
