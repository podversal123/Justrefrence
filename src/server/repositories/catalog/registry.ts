import "server-only";
import { prisma } from "@/server/lib/prisma";
import { createCatalogRepository } from "@/server/repositories/catalog/factory";
import type { CatalogKind, CatalogListItem } from "@/server/domain/catalog/types";

/**
 * The three per-kind instantiations of the generic repository — this file
 * (plus factory.ts) is the ENTIRE ORM-specific surface of the catalog
 * module; everything above it (services, actions, UI) works only in terms
 * of `CatalogKind` and the shared `CatalogListItem` shape. See
 * docs/adr/0011-catalog-architecture.md.
 */

function toListItem(row: any): CatalogListItem {
  return {
    id: row.id,
    vendorId: row.vendorId,
    vendorBusinessName: row.vendor?.businessName ?? "—",
    categoryId: row.categoryId,
    categoryName: row.category?.name ?? "—",
    subcategoryId: row.subcategoryId ?? null,
    subcategoryName: row.subcategory?.name ?? null,
    title: row.title,
    slug: row.slug,
    price: row.price !== null && row.price !== undefined ? String(row.price) : null,
    currency: row.currency,
    approvalStatus: row.approvalStatus,
    isActive: row.isActive,
    primaryImagePath: row.images?.[0]?.storagePath ?? null,
    createdAt: row.createdAt,
  };
}

const productRepository = createCatalogRepository({
  delegate: prisma.product,
  categoryDelegate: prisma.productCategory,
  subcategoryDelegate: prisma.productSubcategory,
  imageDelegate: prisma.productImage,
  imageForeignKey: "productId",
  toListItem,
});

const serviceRepository = createCatalogRepository({
  delegate: prisma.service,
  categoryDelegate: prisma.serviceCategory,
  subcategoryDelegate: prisma.serviceSubcategory,
  imageDelegate: prisma.serviceImage,
  imageForeignKey: "serviceId",
  toListItem,
});

const projectRepository = createCatalogRepository({
  delegate: prisma.project,
  categoryDelegate: prisma.projectCategory,
  subcategoryDelegate: prisma.projectSubcategory,
  imageDelegate: prisma.projectImage,
  imageForeignKey: "projectId",
  toListItem,
});

export const CATALOG_REPOSITORIES: Record<CatalogKind, typeof productRepository> = {
  PRODUCT: productRepository,
  SERVICE: serviceRepository,
  PROJECT: projectRepository,
};

export function getCatalogRepository(kind: CatalogKind) {
  return CATALOG_REPOSITORIES[kind];
}

/** The image model's FK field name differs per kind — used when building `data` for addImage(). */
export const CATALOG_IMAGE_FK: Record<CatalogKind, string> = {
  PRODUCT: "productId",
  SERVICE: "serviceId",
  PROJECT: "projectId",
};
