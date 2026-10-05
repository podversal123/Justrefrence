"use server";

import { revalidatePath } from "next/cache";
import {
  createListing,
  updateListing,
  deleteListing,
  updateListingStatus,
  uploadListingImage,
  deleteListingImage,
  createCategory,
  createSubcategory,
} from "@/server/domain/catalog/listing-service";
import {
  catalogKindSchema,
  categorySchema,
  generateSlug,
  subcategorySchema,
} from "@/lib/schemas/catalog";
import { isCatalogKind, type CatalogKind } from "@/server/domain/catalog/types";
import { AppError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import type { ApiResult } from "@/lib/api-response";

/**
 * The Next.js-visible edge of the catalog module — every exported function
 * here is a thin wrapper (parse `kind`, call the one real implementation in
 * listing-service.ts, map errors to the envelope). See
 * docs/adr/0011-catalog-architecture.md for why this file can't itself be
 * generated/shared: Next's "use server" compiler requires statically
 * visible top-level exports.
 */

function requestId() {
  return crypto.randomUUID();
}

function toFailure(error: unknown, fallbackMessage: string): ApiResult<never> {
  if (error instanceof AppError) {
    return {
      success: false,
      error: { code: error.code, message: error.message, details: error.details },
      meta: { requestId: requestId() },
    };
  }
  logger.error("catalog_action_failed", {
    message: error instanceof Error ? error.message : String(error),
  });
  return {
    success: false,
    error: { code: "INTERNAL_ERROR", message: fallbackMessage },
    meta: { requestId: requestId() },
  };
}

function revalidateCatalogPaths(kind: CatalogKind, id?: string) {
  const segment = kind.toLowerCase() + "s"; // products / services / projects
  revalidatePath(`/admin/${segment}`);
  revalidatePath(`/vendor/${segment}`);
  revalidatePath(`/${segment}`);
  if (id) {
    revalidatePath(`/admin/${segment}/${id}`);
    revalidatePath(`/vendor/${segment}/${id}`);
  }
}

function parseKind(formData: FormData): CatalogKind | null {
  const raw = formData.get("kind");
  return isCatalogKind(raw) ? raw : null;
}

export async function createListingAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<{ id: string }>> {
  const kind = parseKind(formData);
  if (!kind) return toFailure(new Error("missing kind"), "Invalid catalog type.");

  try {
    const created = await createListing(kind, formData);
    revalidateCatalogPaths(kind);
    return { success: true, data: { id: created.id }, meta: { requestId: requestId() } };
  } catch (error) {
    return toFailure(error, "Could not create the listing.");
  }
}

export async function updateListingAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  const kind = parseKind(formData);
  const id = String(formData.get("id") ?? "");
  if (!kind || !id) return toFailure(new Error("missing kind/id"), "Invalid request.");

  try {
    await updateListing(kind, id, formData);
    revalidateCatalogPaths(kind, id);
    return { success: true, data: null, meta: { requestId: requestId() } };
  } catch (error) {
    return toFailure(error, "Could not update the listing.");
  }
}

export async function deleteListingAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  const kind = parseKind(formData);
  const id = String(formData.get("id") ?? "");
  if (!kind || !id) return toFailure(new Error("missing kind/id"), "Invalid request.");

  try {
    await deleteListing(kind, id);
    revalidateCatalogPaths(kind, id);
    return { success: true, data: null, meta: { requestId: requestId() } };
  } catch (error) {
    return toFailure(error, "Could not delete the listing.");
  }
}

export async function updateListingStatusAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  const kindResult = catalogKindSchema.safeParse(formData.get("kind"));
  if (!kindResult.success) return toFailure(new Error("bad kind"), "Invalid catalog type.");

  try {
    await updateListingStatus({
      kind: kindResult.data,
      id: String(formData.get("id") ?? ""),
      action: String(formData.get("action") ?? "") as never,
      reason: (formData.get("reason") as string) || undefined,
    });
    revalidateCatalogPaths(kindResult.data, String(formData.get("id") ?? ""));
    return { success: true, data: null, meta: { requestId: requestId() } };
  } catch (error) {
    return toFailure(error, "Could not update the listing status.");
  }
}

export async function uploadListingImageAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<{ id: string; storagePath: string }>> {
  const kind = parseKind(formData);
  const itemId = String(formData.get("itemId") ?? "");
  const file = formData.get("file");

  if (!kind || !itemId || !(file instanceof File)) {
    return toFailure(new Error("missing fields"), "Choose an image to upload.");
  }

  try {
    const image = await uploadListingImage(kind, itemId, file);
    revalidateCatalogPaths(kind, itemId);
    return {
      success: true,
      data: { id: image.id, storagePath: image.storagePath as string },
      meta: { requestId: requestId() },
    };
  } catch (error) {
    return toFailure(error, "Could not upload the image.");
  }
}

export async function deleteListingImageAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  const kind = parseKind(formData);
  const imageId = String(formData.get("imageId") ?? "");
  if (!kind || !imageId) return toFailure(new Error("missing fields"), "Invalid request.");

  try {
    await deleteListingImage(kind, imageId);
    revalidateCatalogPaths(kind);
    return { success: true, data: null, meta: { requestId: requestId() } };
  } catch (error) {
    return toFailure(error, "Could not delete the image.");
  }
}

export async function createCategoryAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<{ id: string }>> {
  const kind = parseKind(formData);
  if (!kind) return toFailure(new Error("missing kind"), "Invalid catalog type.");

  const parsed = categorySchema.safeParse({ name: formData.get("name") });
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Enter a category name.",
        details: parsed.error.flatten(),
      },
      meta: { requestId: requestId() },
    };
  }

  try {
    const category = await createCategory(kind, parsed.data.name, generateSlug(parsed.data.name));
    revalidateCatalogPaths(kind);
    return { success: true, data: { id: category.id }, meta: { requestId: requestId() } };
  } catch (error) {
    return toFailure(error, "Could not create the category.");
  }
}

export async function createSubcategoryAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<{ id: string }>> {
  const kind = parseKind(formData);
  if (!kind) return toFailure(new Error("missing kind"), "Invalid catalog type.");

  const parsed = subcategorySchema.safeParse({
    categoryId: formData.get("categoryId"),
    name: formData.get("name"),
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

  try {
    const subcategory = await createSubcategory(
      kind,
      parsed.data.categoryId,
      parsed.data.name,
      generateSlug(parsed.data.name),
    );
    revalidateCatalogPaths(kind);
    return { success: true, data: { id: subcategory.id }, meta: { requestId: requestId() } };
  } catch (error) {
    return toFailure(error, "Could not create the subcategory.");
  }
}
