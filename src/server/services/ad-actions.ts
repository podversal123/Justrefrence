"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { authorize } from "@/server/auth/authorize";
import { prisma } from "@/server/lib/prisma";
import { adFieldsSchema, adIdSchema, rejectAdSchema } from "@/lib/schemas/ad";
import { deleteBannerImage, uploadBannerImage } from "@/server/lib/banner-image";
import { ADS_TAG, getAd, userIdsWithPermission } from "@/server/repositories/ads/ad-repository";
import { canApprove, canPause, canReject } from "@/server/domain/ads/rules";
import { createNotification } from "@/server/repositories/identity/notification-repository";
import { recordAudit } from "@/server/domain/audit/record";
import {
  AuthorizationError,
  ConflictError,
  NotFoundError,
  RateLimitedError,
  ValidationError,
} from "@/server/lib/errors";
import { contentRateLimiter } from "@/server/lib/rate-limit";
import { logger } from "@/server/lib/logger";
import { failureFrom, requestId, validationFailure } from "@/server/lib/action-helpers";
import type { ApiResult } from "@/lib/api-response";

/**
 * Vendor advertisements. The vendor creates, edits, pauses and removes only their own ads; staff
 * (`ad:review`) approve or turn down. Every action checks the permission on the server, checks
 * ownership separately from it, validates the input and writes an audit entry. Every status change is
 * one conditional update, so two staff members clicking at once cannot both win.
 */

const TAG = "ad_action_failed";
const ok = (): ApiResult<null> => ({ success: true, data: null, meta: { requestId: requestId() } });

// Ad photos are shown as small cards, so they can be narrower than a hero banner.
const AD_IMAGE = { folder: "ads", minWidth: 600, maxWidth: 1600 } as const;

function refresh() {
  revalidateTag(ADS_TAG, { expire: 0 });
  revalidatePath("/");
  revalidatePath("/vendor/ads");
  revalidatePath("/admin/ads");
}

/** Notifications are a courtesy: a failure to deliver one never undoes the change it describes. */
async function notify(userId: string, type: string, payload: Record<string, string>) {
  await createNotification({ userId, type, payload }).catch(() => undefined);
}

async function dropImage(path: string) {
  await deleteBannerImage(path).catch((error) =>
    logger.warn("ad_image_not_removed", { message: String(error) }),
  );
}

async function requireApprovedVendor(vendorProfileId: string | null) {
  if (!vendorProfileId) throw new AuthorizationError("You need a vendor profile to run ads.");
  const vendor = await prisma.vendorProfile.findUnique({
    where: { id: vendorProfileId },
    select: { approvalStatus: true },
  });
  if (vendor?.approvalStatus !== "APPROVED") {
    throw new AuthorizationError("Your vendor account must be approved before you can run ads.");
  }
  return vendorProfileId;
}

function fieldsFrom(formData: FormData) {
  return adFieldsSchema.safeParse({
    headline: formData.get("headline"),
    subline: formData.get("subline") ?? undefined,
    ctaLabel: formData.get("ctaLabel"),
    ctaHref: formData.get("ctaHref"),
  });
}

/** Tells everyone who can review ads that one is waiting. */
async function notifyReviewers(adId: string, vendorName: string) {
  const reviewers = await userIdsWithPermission("ad:review");
  await Promise.all(
    reviewers.map((userId) => notify(userId, "AD_SUBMITTED", { adId, vendor: vendorName })),
  );
}

export async function createAdAction(_prev: unknown, formData: FormData): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("ad:create");
  } catch (error) {
    return failureFrom(TAG, error, "You don't have permission to run ads.");
  }
  const parsed = fieldsFrom(formData);
  if (!parsed.success) return validationFailure("Check the fields below.", parsed.error);

  let imagePath: string | null = null;
  try {
    const vendorId = await requireApprovedVendor(session.vendorProfileId);
    const limit = await contentRateLimiter.consume(`ad:${session.userId}`);
    if (!limit.allowed) throw new RateLimitedError("You're adding ads too quickly. Please wait.");

    const file = formData.get("image");
    if (!(file instanceof File)) throw new ValidationError("Choose a photo for the ad.");
    imagePath = await uploadBannerImage(file, AD_IMAGE);

    const ad = await prisma.advertisement.create({
      data: { ...parsed.data, subline: parsed.data.subline ?? null, imagePath, vendorId },
      select: { id: true, vendor: { select: { businessName: true } } },
    });
    await recordAudit({
      actorId: session.userId,
      action: "AD_SUBMITTED",
      entityType: "advertisements",
      entityId: ad.id,
      after: { headline: parsed.data.headline },
    });
    await notifyReviewers(ad.id, ad.vendor.businessName);
    refresh();
    return ok();
  } catch (error) {
    if (imagePath) await dropImage(imagePath);
    return failureFrom(TAG, error, "Could not add the ad.");
  }
}

/** Editing sends the ad back for approval, even if it was showing, so approved content can't be swapped silently. */
export async function updateAdAction(_prev: unknown, formData: FormData): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("ad:create");
  } catch (error) {
    return failureFrom(TAG, error, "You don't have permission to run ads.");
  }
  const id = adIdSchema.safeParse({ adId: formData.get("id") });
  const parsed = fieldsFrom(formData);
  if (!id.success) return failureFrom(TAG, new NotFoundError("Ad not found."));
  if (!parsed.success) return validationFailure("Check the fields below.", parsed.error);

  let newImage: string | null = null;
  try {
    const vendorId = await requireApprovedVendor(session.vendorProfileId);
    const existing = await getAd(id.data.adId);
    if (!existing || existing.vendorId !== vendorId) throw new NotFoundError("Ad not found.");

    const file = formData.get("image");
    if (file instanceof File && file.size > 0) newImage = await uploadBannerImage(file, AD_IMAGE);

    const moved = await prisma.advertisement.updateMany({
      where: { id: existing.id, vendorId },
      data: {
        ...parsed.data,
        subline: parsed.data.subline ?? null,
        ...(newImage ? { imagePath: newImage } : {}),
        status: "PENDING",
        rejectedReason: null,
        reviewedBy: null,
        reviewedAt: null,
      },
    });
    if (moved.count === 0) throw new NotFoundError("Ad not found.");
    if (newImage) await dropImage(existing.imagePath);

    await recordAudit({
      actorId: session.userId,
      action: "AD_EDITED",
      entityType: "advertisements",
      entityId: existing.id,
      after: { headline: parsed.data.headline, photoReplaced: Boolean(newImage) },
    });
    await notifyReviewers(existing.id, existing.vendor.businessName);
    refresh();
    return ok();
  } catch (error) {
    if (newImage) await dropImage(newImage);
    return failureFrom(TAG, error, "Could not save the ad.");
  }
}

export async function toggleAdAction(_prev: unknown, formData: FormData): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("ad:create");
  } catch (error) {
    return failureFrom(TAG, error, "You don't have permission to run ads.");
  }
  try {
    const { adId } = adIdSchema.parse({ adId: formData.get("adId") });
    const ad = await getAd(adId);
    if (!ad || ad.vendorId !== session.vendorProfileId) throw new NotFoundError("Ad not found.");
    const check = canPause(ad);
    if (!check.ok) throw new ConflictError(check.message ?? "This ad can't be changed.");

    const moved = await prisma.advertisement.updateMany({
      where: { id: adId, vendorId: ad.vendorId, status: "APPROVED" },
      data: { isActive: !ad.isActive },
    });
    if (moved.count === 0) throw new ConflictError("This ad just changed. Refresh and try again.");
    await recordAudit({
      actorId: session.userId,
      action: ad.isActive ? "AD_PAUSED" : "AD_RESUMED",
      entityType: "advertisements",
      entityId: adId,
    });
    refresh();
    return ok();
  } catch (error) {
    return failureFrom(TAG, error, "Could not change the ad.");
  }
}

export async function deleteAdAction(_prev: unknown, formData: FormData): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("ad:create");
  } catch (error) {
    return failureFrom(TAG, error, "You don't have permission to run ads.");
  }
  try {
    const { adId } = adIdSchema.parse({ adId: formData.get("adId") });
    const ad = await getAd(adId);
    if (!ad || ad.vendorId !== session.vendorProfileId) throw new NotFoundError("Ad not found.");
    await prisma.advertisement.delete({ where: { id: adId } });
    await dropImage(ad.imagePath);
    await recordAudit({
      actorId: session.userId,
      action: "AD_DELETED",
      entityType: "advertisements",
      entityId: adId,
      before: { headline: ad.headline },
    });
    refresh();
    return ok();
  } catch (error) {
    return failureFrom(TAG, error, "Could not delete the ad.");
  }
}

export async function approveAdAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("ad:review");
  } catch (error) {
    return failureFrom(TAG, error, "You don't have permission to review ads.");
  }
  try {
    const { adId } = adIdSchema.parse({ adId: formData.get("adId") });
    const ad = await getAd(adId);
    if (!ad) throw new NotFoundError("Ad not found.");
    const check = canApprove(ad);
    if (!check.ok) throw new ConflictError(check.message ?? "This ad can't be approved.");

    // Atomic: only the first reviewer's click changes it; the second sees it already decided.
    const now = new Date();
    const moved = await prisma.advertisement.updateMany({
      where: { id: adId, status: "PENDING" },
      data: {
        status: "APPROVED",
        reviewedBy: session.userId,
        reviewedAt: now,
        rejectedReason: null,
      },
    });
    if (moved.count === 0) throw new ConflictError("Someone just reviewed this ad.");

    await notify(ad.vendor.userId, "AD_APPROVED", { adId });
    await recordAudit({
      actorId: session.userId,
      action: "AD_APPROVED",
      entityType: "advertisements",
      entityId: adId,
      after: { headline: ad.headline },
    });
    refresh();
    return ok();
  } catch (error) {
    return failureFrom(TAG, error, "Could not approve the ad.");
  }
}

export async function rejectAdAction(_prev: unknown, formData: FormData): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("ad:review");
  } catch (error) {
    return failureFrom(TAG, error, "You don't have permission to review ads.");
  }
  const parsed = rejectAdSchema.safeParse({
    adId: formData.get("adId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success) return validationFailure("Give a short reason.", parsed.error);

  try {
    const ad = await getAd(parsed.data.adId);
    if (!ad) throw new NotFoundError("Ad not found.");
    const check = canReject(ad);
    if (!check.ok) throw new ConflictError(check.message ?? "This ad can't be turned down.");

    const moved = await prisma.advertisement.updateMany({
      where: { id: ad.id, status: { in: ["PENDING", "APPROVED"] } },
      data: {
        status: "REJECTED",
        rejectedReason: parsed.data.reason,
        reviewedBy: session.userId,
        reviewedAt: new Date(),
      },
    });
    if (moved.count === 0) throw new ConflictError("Someone just reviewed this ad.");

    await notify(ad.vendor.userId, "AD_REJECTED", { adId: ad.id });
    await recordAudit({
      actorId: session.userId,
      action: "AD_REJECTED",
      entityType: "advertisements",
      entityId: ad.id,
      after: { headline: ad.headline, reason: parsed.data.reason },
    });
    refresh();
    return ok();
  } catch (error) {
    return failureFrom(TAG, error, "Could not turn down the ad.");
  }
}
