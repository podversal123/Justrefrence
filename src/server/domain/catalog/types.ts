import type { Permission } from "@/server/auth/permissions";

/**
 * The three catalog kinds — see docs/adr/0011-catalog-architecture.md. Every
 * generic catalog function is parameterized by this instead of having a
 * separate implementation per kind.
 */
export const CATALOG_KINDS = ["PRODUCT", "SERVICE", "PROJECT"] as const;
export type CatalogKind = (typeof CATALOG_KINDS)[number];

export function isCatalogKind(value: unknown): value is CatalogKind {
  return typeof value === "string" && (CATALOG_KINDS as readonly string[]).includes(value);
}

export interface CatalogPermissions {
  create: Permission;
  read: Permission;
  update: Permission;
  delete: Permission;
  approve: Permission;
}

/** Permission codes are identical in shape across all three kinds — see docs/rbac.md §3. */
export const CATALOG_PERMISSIONS: Record<CatalogKind, CatalogPermissions> = {
  PRODUCT: {
    create: "product:create",
    read: "product:read",
    update: "product:update",
    delete: "product:delete",
    approve: "product:approve",
  },
  SERVICE: {
    create: "service:create",
    read: "service:read",
    update: "service:update",
    delete: "service:delete",
    approve: "service:approve",
  },
  PROJECT: {
    create: "project:create",
    read: "project:read",
    update: "project:update",
    delete: "project:delete",
    approve: "project:approve",
  },
};

export const CATALOG_LABELS: Record<CatalogKind, { singular: string; plural: string }> = {
  PRODUCT: { singular: "Product", plural: "Products" },
  SERVICE: { singular: "Service", plural: "Services" },
  PROJECT: { singular: "Project", plural: "Projects" },
};

/**
 * URL segment ↔ CatalogKind mapping — admin/vendor management routes use a
 * single dynamic `[kind]` segment (e.g. /admin/catalog/products) so one
 * page.tsx serves all three kinds, per docs/adr/0011.
 */
export const CATALOG_ROUTE_SEGMENTS: Record<CatalogKind, string> = {
  PRODUCT: "products",
  SERVICE: "services",
  PROJECT: "projects",
};

const SEGMENT_TO_KIND: Record<string, CatalogKind> = {
  products: "PRODUCT",
  services: "SERVICE",
  projects: "PROJECT",
};

export function kindFromRouteSegment(segment: string): CatalogKind | null {
  return SEGMENT_TO_KIND[segment] ?? null;
}

export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED";

/** The shape every catalog list row is normalized to, regardless of kind. */
export interface CatalogListItem {
  id: string;
  vendorId: string;
  vendorBusinessName: string;
  categoryId: string;
  categoryName: string;
  subcategoryId: string | null;
  subcategoryName: string | null;
  title: string;
  slug: string;
  price: string | null; // paise, stringified (BigInt isn't JSON-safe across the RSC boundary)
  currency: string;
  approvalStatus: ApprovalStatus;
  isActive: boolean;
  primaryImagePath: string | null;
  createdAt: Date;
}

export interface CatalogListQuery {
  search?: string;
  categoryId?: string;
  subcategoryId?: string;
  approvalStatus?: ApprovalStatus;
  isActive?: boolean;
  vendorId?: string;
  sortBy: "createdAt" | "title" | "price";
  sortDir: "asc" | "desc";
  cursor?: string;
  limit: number;
}
