// Deliberately no "server-only" import here — every dependency this module
// touches (authorize, the repository registry, image-upload, audit) already
// carries that guard, so it's enforced transitively when actually bundled.
// Keeping this file guard-free is what makes it possible to test the real
// ownership/state-machine orchestration logic (tests/integration/catalog-
// actions.test.ts) by mocking only those leaf dependencies — see
// docs/adr/0011-catalog-architecture.md and the same pattern used for
// evaluate-authorization.ts vs. authorize.ts in Phase 1.
import { authorize } from "@/server/auth/authorize";
import type { AuthSession } from "@/server/auth/session";
import { recordAudit } from "@/server/domain/audit/record";
import { getCatalogRepository, CATALOG_IMAGE_FK } from "@/server/repositories/catalog/registry";
import { canManageListing } from "@/server/domain/catalog/ownership";
import {
  assertApprovalTransition,
  editRequiresReapproval,
} from "@/server/domain/catalog/state-machine";
import {
  CATALOG_PERMISSIONS,
  CATALOG_LABELS,
  type CatalogKind,
} from "@/server/domain/catalog/types";
import { uploadCatalogImage, deleteCatalogImage } from "@/server/lib/image-upload";
import {
  getListingSchema,
  generateSlug,
  updateListingStatusSchema,
  type UpdateListingStatusInput,
} from "@/lib/schemas/catalog";
import { ConflictError, NotFoundError, ValidationError } from "@/server/lib/errors";
import { randomUUID } from "node:crypto";

/**
 * The one real implementation behind every catalog Server Action — see
 * docs/adr/0011-catalog-architecture.md. Each function here is generic over
 * `kind`; src/server/services/catalog-actions.ts is the thin, Next.js
 * "use server"-compatible edge that calls into this.
 */

async function getOwnedListingOrThrow(kind: CatalogKind, id: string, session: AuthSession) {
  const repo = getCatalogRepository(kind);
  const listing = await repo.getById(id);
  if (!listing) throw new NotFoundError(`${CATALOG_LABELS[kind].singular} not found.`);
  if (!canManageListing(session.vendorProfileId, listing.vendorId)) {
    throw new NotFoundError(`${CATALOG_LABELS[kind].singular} not found.`);
  }
  return listing;
}

export async function createListing(kind: CatalogKind, formData: FormData) {
  const session = await authorize(CATALOG_PERMISSIONS[kind].create);

  const schema = getListingSchema(kind);
  const raw = Object.fromEntries(formData.entries());
  const parsed = schema.safeParse({ ...raw, kind });
  if (!parsed.success) {
    throw new ValidationError("Check the fields below.", parsed.error.flatten());
  }
  const data = parsed.data;

  // A vendor can only ever create their own listing — the field is never
  // read from the client when the caller has a vendor profile (same
  // structural-ownership pattern as Phase 2's updateVendorProfileAction).
  let vendorId: string;
  if (session.vendorProfileId) {
    vendorId = session.vendorProfileId;
  } else {
    const submittedVendorId = String(formData.get("vendorId") ?? "");
    if (!submittedVendorId)
      throw new ValidationError("Choose which vendor this listing belongs to.");
    vendorId = submittedVendorId;
  }

  const repo = getCatalogRepository(kind);
  const subcategoryId =
    "subcategoryId" in data && data.subcategoryId ? data.subcategoryId : undefined;
  const slug = generateSlug(data.title, randomUUID().slice(0, 8));

  const createData: Record<string, unknown> = {
    vendorId,
    categoryId: data.categoryId,
    subcategoryId,
    title: data.title,
    slug,
    description: "description" in data && data.description ? data.description : undefined,
    approvalStatus: "PENDING",
    isActive: true,
  };

  if (kind === "PRODUCT" && "price" in data) {
    createData["price"] = data.price;
    createData["sku"] = "sku" in data && data.sku ? data.sku : undefined;
    createData["stock"] = "stock" in data ? data.stock : 0;
  } else if (kind === "SERVICE" && "pricingType" in data) {
    createData["pricingType"] = data.pricingType;
    createData["price"] = data.pricingType === "QUOTE" ? null : data.price;
  } else if (kind === "PROJECT" && "price" in data) {
    createData["price"] = data.price;
  }

  const created = await repo.create(createData);

  await recordAudit({
    actorId: session.userId,
    action: `${kind}_CREATED`,
    entityType: kind.toLowerCase() + "s",
    entityId: created.id,
    after: { title: data.title, vendorId },
  });

  return created;
}

export async function updateListing(kind: CatalogKind, id: string, formData: FormData) {
  const session = await authorize(CATALOG_PERMISSIONS[kind].update);
  const existing = await getOwnedListingOrThrow(kind, id, session);

  const schema = getListingSchema(kind);
  const raw = Object.fromEntries(formData.entries());
  const parsed = schema.safeParse({ ...raw, kind });
  if (!parsed.success) {
    throw new ValidationError("Check the fields below.", parsed.error.flatten());
  }
  const data = parsed.data;
  const subcategoryId = "subcategoryId" in data && data.subcategoryId ? data.subcategoryId : null;

  const updateData: Record<string, unknown> = {
    categoryId: data.categoryId,
    subcategoryId,
    title: data.title,
    description: "description" in data && data.description ? data.description : null,
  };

  if (kind === "PRODUCT" && "price" in data) {
    updateData["price"] = data.price;
    updateData["sku"] = "sku" in data && data.sku ? data.sku : null;
    updateData["stock"] = "stock" in data ? data.stock : 0;
  } else if (kind === "SERVICE" && "pricingType" in data) {
    updateData["pricingType"] = data.pricingType;
    updateData["price"] = data.pricingType === "QUOTE" ? null : data.price;
  } else if (kind === "PROJECT" && "price" in data) {
    updateData["price"] = data.price;
  }

  // Editing an already-approved listing sends it back for re-review — see
  // docs/server/domain/catalog/state-machine.ts.
  if (editRequiresReapproval(existing.approvalStatus)) {
    updateData["approvalStatus"] = "PENDING";
    updateData["approvedBy"] = null;
    updateData["approvedAt"] = null;
  }

  const repo = getCatalogRepository(kind);
  const updated = await repo.update(id, updateData);

  await recordAudit({
    actorId: session.userId,
    action: `${kind}_UPDATED`,
    entityType: kind.toLowerCase() + "s",
    entityId: id,
    before: { title: existing.title },
    after: { title: data.title },
  });

  return updated;
}

export async function deleteListing(kind: CatalogKind, id: string) {
  const session = await authorize(CATALOG_PERMISSIONS[kind].delete);
  const existing = await getOwnedListingOrThrow(kind, id, session);

  const repo = getCatalogRepository(kind);
  await repo.softDelete(id);

  await recordAudit({
    actorId: session.userId,
    action: `${kind}_DELETED`,
    entityType: kind.toLowerCase() + "s",
    entityId: id,
    before: { title: existing.title },
  });
}

export async function updateListingStatus(input: UpdateListingStatusInput) {
  const parsed = updateListingStatusSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError("Invalid request.", parsed.error.flatten());
  const { kind, id, action, reason } = parsed.data;

  const isApprovalAction = action === "approve" || action === "reject";
  const permission = isApprovalAction
    ? CATALOG_PERMISSIONS[kind].approve
    : CATALOG_PERMISSIONS[kind].update;
  const session = await authorize(permission);

  const existing = await getOwnedListingOrThrow(kind, id, session);
  const repo = getCatalogRepository(kind);

  let updateData: Record<string, unknown>;

  switch (action) {
    case "approve":
      assertApprovalTransition(existing.approvalStatus, "APPROVED");
      updateData = {
        approvalStatus: "APPROVED",
        approvedBy: session.userId,
        approvedAt: new Date(),
        rejectedReason: null,
      };
      break;
    case "reject":
      assertApprovalTransition(existing.approvalStatus, "REJECTED");
      updateData = {
        approvalStatus: "REJECTED",
        approvedBy: session.userId,
        approvedAt: new Date(),
        rejectedReason: reason,
      };
      break;
    case "resubmit":
      assertApprovalTransition(existing.approvalStatus, "PENDING");
      updateData = { approvalStatus: "PENDING", rejectedReason: null };
      break;
    case "activate":
      updateData = { isActive: true };
      break;
    case "deactivate":
      updateData = { isActive: false };
      break;
  }

  await repo.update(id, updateData);

  await recordAudit({
    actorId: session.userId,
    action: `${kind}_${action.toUpperCase()}`,
    entityType: kind.toLowerCase() + "s",
    entityId: id,
    before: { approvalStatus: existing.approvalStatus, isActive: existing.isActive },
    after: updateData,
  });
}

const MAX_IMAGES_PER_LISTING = 8;

export async function uploadListingImage(kind: CatalogKind, itemId: string, file: File) {
  const session = await authorize(CATALOG_PERMISSIONS[kind].update);
  await getOwnedListingOrThrow(kind, itemId, session);

  const repo = getCatalogRepository(kind);
  const existingCount = await repo.countImages(itemId);
  if (existingCount >= MAX_IMAGES_PER_LISTING) {
    throw new ConflictError(`A listing can have at most ${MAX_IMAGES_PER_LISTING} images.`);
  }

  const uploaded = await uploadCatalogImage(
    file,
    kind.toLowerCase() as "product" | "service" | "project",
    itemId,
  );

  const fk = CATALOG_IMAGE_FK[kind];
  const image = await repo.addImage({
    [fk]: itemId,
    storagePath: uploaded.storagePath,
    sortOrder: existingCount,
  });

  await recordAudit({
    actorId: session.userId,
    action: `${kind}_IMAGE_UPLOADED`,
    entityType: kind.toLowerCase() + "_images",
    entityId: image.id,
    after: { itemId, storagePath: uploaded.storagePath },
  });

  return image;
}

export async function deleteListingImage(kind: CatalogKind, imageId: string) {
  const repo = getCatalogRepository(kind);
  const image = await repo.getImage(imageId);
  if (!image) throw new NotFoundError("Image not found.");

  const itemIdField = CATALOG_IMAGE_FK[kind] as keyof typeof image;
  const itemId = image[itemIdField] as string;

  const session = await authorize(CATALOG_PERMISSIONS[kind].update);
  await getOwnedListingOrThrow(kind, itemId, session);

  await repo.removeImage(imageId);
  await deleteCatalogImage(image.storagePath as string);

  await recordAudit({
    actorId: session.userId,
    action: `${kind}_IMAGE_DELETED`,
    entityType: kind.toLowerCase() + "_images",
    entityId: imageId,
    before: { itemId },
  });
}

export async function createCategory(kind: CatalogKind, name: string, slug: string) {
  const session = await authorize("category:manage");
  const repo = getCatalogRepository(kind);

  const existing = await repo.listCategories();
  if (existing.some((c: { slug: string }) => c.slug === slug)) {
    throw new ConflictError("A category with that name already exists.");
  }

  const category = await repo.createCategory({ name, slug });
  await recordAudit({
    actorId: session.userId,
    action: `${kind}_CATEGORY_CREATED`,
    entityType: kind.toLowerCase() + "_categories",
    entityId: category.id,
    after: { name },
  });
  return category;
}

export async function createSubcategory(
  kind: CatalogKind,
  categoryId: string,
  name: string,
  slug: string,
) {
  const session = await authorize("category:manage");
  const repo = getCatalogRepository(kind);
  const subcategory = await repo.createSubcategory({ categoryId, name, slug });
  await recordAudit({
    actorId: session.userId,
    action: `${kind}_SUBCATEGORY_CREATED`,
    entityType: kind.toLowerCase() + "_subcategories",
    entityId: subcategory.id,
    after: { name, categoryId },
  });
  return subcategory;
}
