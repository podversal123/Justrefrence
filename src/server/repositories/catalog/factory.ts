import "server-only";
import {
  buildListingOrderBy,
  buildListingWhere,
  type BuildListingWhereOptions,
} from "@/server/repositories/catalog/query";
import type { CatalogKind, CatalogListItem, CatalogListQuery } from "@/server/domain/catalog/types";

/**
 * The generic catalog repository — one implementation, instantiated three
 * times (see registry.ts) rather than hand-written per kind. See
 * docs/adr/0011-catalog-architecture.md.
 *
 * Prisma generates a structurally-identical delegate (`findMany`,
 * `findUnique`, `count`, `create`, `update`) for every model, but with
 * distinctly-named input/output types per model (`ProductWhereInput` vs
 * `ServiceWhereInput`, ...). Rather than fighting TypeScript to unify three
 * nominally-different generated types, this factory takes a loosely-typed
 * delegate and normalizes every result to the shared `CatalogListItem`
 * shape via the `toListItem` mapper supplied per kind — the ORM-specific
 * typing risk is contained to registry.ts's three call sites, not spread
 * through application code.
 */

type AnyDelegate = any;

export interface CatalogRepositoryConfig {
  delegate: AnyDelegate;
  categoryDelegate: AnyDelegate;
  subcategoryDelegate: AnyDelegate;
  imageDelegate: AnyDelegate;
  /** The FK column name on the image model, e.g. "productId". */
  imageForeignKey: string;
  /** Which kind this repository serves; lets a typed listing ID be matched in search. */
  kind: CatalogKind;
  /** Maps a raw Prisma row (with vendor/category/subcategory/images included) to the shared shape. */
  toListItem: (row: AnyDelegate) => CatalogListItem;
}

const LIST_INCLUDE = {
  vendor: { select: { businessName: true } },
  category: { select: { name: true } },
  subcategory: { select: { name: true } },
  images: { orderBy: { sortOrder: "asc" as const }, take: 1, select: { storagePath: true } },
};

export function createCatalogRepository(config: CatalogRepositoryConfig) {
  const {
    delegate,
    categoryDelegate,
    subcategoryDelegate,
    imageDelegate,
    imageForeignKey,
    toListItem,
    kind,
  } = config;

  async function list(
    query: CatalogListQuery,
    options: BuildListingWhereOptions = {},
  ): Promise<{ items: CatalogListItem[]; nextCursor: string | null }> {
    const where = buildListingWhere(query, { ...options, kind });
    const orderBy = buildListingOrderBy(query);

    const rows = await delegate.findMany({
      where,
      orderBy: [orderBy, { id: "asc" }],
      take: query.limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
      include: LIST_INCLUDE,
    });

    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;

    return {
      items: page.map(toListItem),
      nextCursor: hasMore ? (page.at(-1)?.id ?? null) : null,
    };
  }

  async function count(
    query: Pick<
      CatalogListQuery,
      "search" | "categoryId" | "subcategoryId" | "approvalStatus" | "isActive" | "vendorId"
    >,
    options: BuildListingWhereOptions = {},
  ): Promise<number> {
    return delegate.count({ where: buildListingWhere(query, { ...options, kind }) });
  }

  async function getById(id: string) {
    return delegate.findFirst({
      where: { id, deletedAt: null },
      include: {
        vendor: { select: { id: true, businessName: true, userId: true } },
        category: { select: { id: true, name: true } },
        subcategory: { select: { id: true, name: true } },
        images: { orderBy: { sortOrder: "asc" } },
        approver: { select: { email: true, fullName: true } },
      },
    });
  }

  async function getBySlug(slug: string) {
    return delegate.findFirst({
      where: { slug, deletedAt: null },
      include: {
        vendor: { select: { id: true, businessName: true } },
        category: { select: { id: true, name: true } },
        subcategory: { select: { id: true, name: true } },
        images: { orderBy: { sortOrder: "asc" } },
      },
    });
  }

  async function create(data: AnyDelegate) {
    return delegate.create({ data });
  }

  async function update(id: string, data: AnyDelegate) {
    return delegate.update({ where: { id }, data });
  }

  async function softDelete(id: string) {
    return delegate.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async function listCategories() {
    return categoryDelegate.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      include: { subcategories: { where: { deletedAt: null }, orderBy: { name: "asc" } } },
    });
  }

  async function createCategory(data: { name: string; slug: string }) {
    return categoryDelegate.create({ data });
  }

  async function createSubcategory(data: { categoryId: string; name: string; slug: string }) {
    return subcategoryDelegate.create({ data });
  }

  /**
   * Removing keeps the row (listings and history may still point at it) but frees the slug,
   * so the same name can be created again later.
   */
  async function deleteCategory(id: string) {
    const row = await categoryDelegate.findUnique({ where: { id }, select: { slug: true } });
    const now = new Date();
    return categoryDelegate.update({
      where: { id },
      data: { deletedAt: now, slug: `${row?.slug ?? "removed"}-removed-${now.getTime()}` },
    });
  }

  async function deleteSubcategory(id: string) {
    const row = await subcategoryDelegate.findUnique({ where: { id }, select: { slug: true } });
    const now = new Date();
    return subcategoryDelegate.update({
      where: { id },
      data: { deletedAt: now, slug: `${row?.slug ?? "removed"}-removed-${now.getTime()}` },
    });
  }

  async function getCategory(id: string) {
    return categoryDelegate.findFirst({ where: { id, deletedAt: null } });
  }

  async function getSubcategory(id: string) {
    return subcategoryDelegate.findFirst({ where: { id, deletedAt: null } });
  }

  async function countListingsInCategory(categoryId: string): Promise<number> {
    return delegate.count({ where: { categoryId, deletedAt: null } });
  }

  async function countListingsInSubcategory(subcategoryId: string): Promise<number> {
    return delegate.count({ where: { subcategoryId, deletedAt: null } });
  }

  async function countSubcategories(categoryId: string): Promise<number> {
    return subcategoryDelegate.count({ where: { categoryId, deletedAt: null } });
  }

  async function addImage(data: {
    storagePath: string;
    sortOrder: number;
    [key: string]: unknown;
  }) {
    return imageDelegate.create({ data });
  }

  async function removeImage(imageId: string) {
    return imageDelegate.delete({ where: { id: imageId } });
  }

  async function getImage(imageId: string) {
    return imageDelegate.findUnique({ where: { id: imageId } });
  }

  async function countImages(itemId: string) {
    return imageDelegate.count({ where: { [imageForeignKey]: itemId } });
  }

  return {
    list,
    count,
    getById,
    getBySlug,
    create,
    update,
    softDelete,
    listCategories,
    createCategory,
    createSubcategory,
    deleteCategory,
    deleteSubcategory,
    getCategory,
    getSubcategory,
    countListingsInCategory,
    countListingsInSubcategory,
    countSubcategories,
    addImage,
    removeImage,
    getImage,
    countImages,
  };
}

export type CatalogRepository = ReturnType<typeof createCatalogRepository>;
