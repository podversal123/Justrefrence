"use server";

import { revalidatePath, revalidateTag } from "next/cache";
import { authorize } from "@/server/auth/authorize";
import { bannerFieldsSchema, bannerIdSchema, bannerMoveSchema } from "@/lib/schemas/banner";
import { deleteBannerImage, uploadBannerImage } from "@/server/lib/banner-image";
import {
  BANNERS_TAG,
  createBanner,
  deleteBanner,
  getBanner,
  moveBanner,
  nextSortOrder,
  updateBanner,
} from "@/server/repositories/content/banner-repository";
import { recordAudit } from "@/server/domain/audit/record";
import { NotFoundError, ValidationError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import { failureFrom, requestId, validationFailure } from "@/server/lib/action-helpers";
import type { ApiResult } from "@/lib/api-response";

/**
 * Homepage banner management. Every action checks `banner:manage` on the server, validates the
 * input, writes an audit entry, and refreshes the cached homepage banners straight away.
 */

const ok = (): ApiResult<null> => ({ success: true, data: null, meta: { requestId: requestId() } });

function refresh() {
  revalidateTag(BANNERS_TAG, { expire: 0 });
  revalidatePath("/");
  revalidatePath("/admin/banners");
}

async function dropImage(path: string) {
  await deleteBannerImage(path).catch((error) =>
    logger.warn("banner_image_not_removed", { message: String(error) }),
  );
}

export async function createBannerAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("banner:manage");
  } catch (error) {
    return failureFrom("banner_denied", error, "You don't have permission to manage banners.");
  }
  const parsed = bannerFieldsSchema.safeParse({
    placement: formData.get("placement") ?? undefined,
    headline: formData.get("headline"),
    subline: formData.get("subline") ?? undefined,
    ctaLabel: formData.get("ctaLabel"),
    ctaHref: formData.get("ctaHref"),
  });
  if (!parsed.success) return validationFailure("Check the fields below.", parsed.error);

  let imagePath: string | null = null;
  try {
    const file = formData.get("image");
    if (!(file instanceof File)) throw new ValidationError("Choose a photo for the banner.");
    imagePath = await uploadBannerImage(file);
    const banner = await createBanner({
      ...parsed.data,
      subline: parsed.data.subline ?? null,
      imagePath,
      sortOrder: await nextSortOrder(),
      createdBy: session.userId,
    });
    await recordAudit({
      actorId: session.userId,
      action: "BANNER_CREATED",
      entityType: "banners",
      entityId: banner.id,
      after: { headline: parsed.data.headline },
    });
    refresh();
    return ok();
  } catch (error) {
    if (imagePath) await dropImage(imagePath);
    return failureFrom("banner_create_failed", error, "Could not add the banner.");
  }
}

export async function updateBannerAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("banner:manage");
  } catch (error) {
    return failureFrom("banner_denied", error, "You don't have permission to manage banners.");
  }
  const id = bannerIdSchema.safeParse(formData.get("id"));
  const parsed = bannerFieldsSchema.safeParse({
    placement: formData.get("placement") ?? undefined,
    headline: formData.get("headline"),
    subline: formData.get("subline") ?? undefined,
    ctaLabel: formData.get("ctaLabel"),
    ctaHref: formData.get("ctaHref"),
  });
  if (!id.success) return failureFrom("banner_update", new NotFoundError("Banner not found."));
  if (!parsed.success) return validationFailure("Check the fields below.", parsed.error);

  let newImage: string | null = null;
  try {
    const existing = await getBanner(id.data);
    if (!existing) throw new NotFoundError("Banner not found.");

    // A new photo is optional when editing; without one the current photo stays.
    const file = formData.get("image");
    if (file instanceof File && file.size > 0) newImage = await uploadBannerImage(file);

    await updateBanner(id.data, {
      ...parsed.data,
      subline: parsed.data.subline ?? null,
      ...(newImage ? { imagePath: newImage } : {}),
    });
    if (newImage) await dropImage(existing.imagePath);

    await recordAudit({
      actorId: session.userId,
      action: "BANNER_UPDATED",
      entityType: "banners",
      entityId: id.data,
      after: { headline: parsed.data.headline, photoReplaced: Boolean(newImage) },
    });
    refresh();
    return ok();
  } catch (error) {
    if (newImage) await dropImage(newImage);
    return failureFrom("banner_update_failed", error, "Could not save the banner.");
  }
}

export async function toggleBannerAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("banner:manage");
  } catch (error) {
    return failureFrom("banner_denied", error, "You don't have permission to manage banners.");
  }
  try {
    const id = bannerIdSchema.parse(formData.get("id"));
    const existing = await getBanner(id);
    if (!existing) throw new NotFoundError("Banner not found.");
    await updateBanner(id, { isActive: !existing.isActive });
    await recordAudit({
      actorId: session.userId,
      action: existing.isActive ? "BANNER_HIDDEN" : "BANNER_SHOWN",
      entityType: "banners",
      entityId: id,
    });
    refresh();
    return ok();
  } catch (error) {
    return failureFrom("banner_toggle_failed", error, "Could not change the banner.");
  }
}

export async function moveBannerAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("banner:manage");
  } catch (error) {
    return failureFrom("banner_denied", error, "You don't have permission to manage banners.");
  }
  try {
    const id = bannerIdSchema.parse(formData.get("id"));
    const direction = bannerMoveSchema.parse(formData.get("direction"));
    await moveBanner(id, direction);
    await recordAudit({
      actorId: session.userId,
      action: "BANNER_REORDERED",
      entityType: "banners",
      entityId: id,
      after: { direction },
    });
    refresh();
    return ok();
  } catch (error) {
    return failureFrom("banner_move_failed", error, "Could not move the banner.");
  }
}

export async function deleteBannerAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("banner:manage");
  } catch (error) {
    return failureFrom("banner_denied", error, "You don't have permission to manage banners.");
  }
  try {
    const id = bannerIdSchema.parse(formData.get("id"));
    const existing = await getBanner(id);
    if (!existing) throw new NotFoundError("Banner not found.");
    await deleteBanner(id);
    await dropImage(existing.imagePath);
    await recordAudit({
      actorId: session.userId,
      action: "BANNER_DELETED",
      entityType: "banners",
      entityId: id,
      before: { headline: existing.headline },
    });
    refresh();
    return ok();
  } catch (error) {
    return failureFrom("banner_delete_failed", error, "Could not delete the banner.");
  }
}
