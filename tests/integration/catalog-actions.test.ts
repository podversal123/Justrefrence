import { describe, expect, it, vi, beforeEach } from "vitest";
import { AuthorizationError } from "@/server/lib/errors";
import type { AuthSession } from "@/server/auth/session";
import type { Permission } from "@/server/auth/permissions";

/**
 * Integration-style tests for the generic catalog Server Action layer — see
 * docs/adr/0011-catalog-architecture.md. The repository registry is mocked
 * at its own module boundary (rather than mocking every Prisma delegate it
 * wires up) so each test controls exactly what a "kind" repository returns,
 * the same way tests/integration/vendor-actions.test.ts mocks
 * vendor-repository.ts directly.
 *
 * These specifically prove the Phase 3 brief's requirements: admin can
 * manage all, a vendor can manage only its own listings, and a customer
 * (public path) never sees anything but APPROVED + active listings — the
 * last one is covered by tests/unit/catalog-query.test.ts's `publicOnly`
 * case, since that's where the guarantee actually lives.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockRecordAudit = vi.fn();
vi.mock("@/server/domain/audit/record", () => ({ recordAudit: mockRecordAudit }));

const mockAuthorize = vi.fn();
vi.mock("@/server/auth/authorize", () => ({ authorize: mockAuthorize }));

const mockUploadCatalogImage = vi.fn();
const mockDeleteCatalogImage = vi.fn();
vi.mock("@/server/lib/image-upload", () => ({
  uploadCatalogImage: mockUploadCatalogImage,
  deleteCatalogImage: mockDeleteCatalogImage,
}));

const repoMock = {
  list: vi.fn(),
  count: vi.fn(),
  getById: vi.fn(),
  getBySlug: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  softDelete: vi.fn(),
  listCategories: vi.fn(),
  createCategory: vi.fn(),
  createSubcategory: vi.fn(),
  deleteCategory: vi.fn(),
  deleteSubcategory: vi.fn(),
  addImage: vi.fn(),
  removeImage: vi.fn(),
  getImage: vi.fn(),
  countImages: vi.fn(),
};

const mockGetCatalogRepository = vi.fn(() => repoMock);
vi.mock("@/server/repositories/catalog/registry", () => ({
  getCatalogRepository: mockGetCatalogRepository,
  CATALOG_IMAGE_FK: { PRODUCT: "productId", SERVICE: "serviceId", PROJECT: "projectId" },
}));

const {
  createListingAction,
  updateListingAction,
  deleteListingAction,
  updateListingStatusAction,
  uploadListingImageAction,
  deleteListingImageAction,
  createCategoryAction,
} = await import("@/server/services/catalog-actions");

// zod's .uuid() requires RFC4122 version/variant nibbles — plain "cat-1"
// style fixtures fail validation, so every id below is a valid-format UUID.
const CAT_ID = "11111111-1111-4111-8111-111111111111";
const LISTING_ID = "22222222-2222-4222-8222-222222222222";
const LISTING_ID_2 = "33333333-3333-4333-8333-333333333333";
const IMAGE_ID = "44444444-4444-4444-8444-444444444444";

function adminSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    userId: "admin-1",
    email: "admin@example.com",
    fullName: "Admin",
    status: "ACTIVE",
    roles: ["ADMIN"],
    permissions: new Set<Permission>([
      "product:create",
      "product:read",
      "product:update",
      "product:delete",
      "product:approve",
      "category:manage",
    ]),
    hasVendorProfile: false,
    vendorProfileId: null,
    ...overrides,
  };
}

function vendorSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    userId: "vendor-a-user",
    email: "vendor-a@example.com",
    fullName: "Vendor A",
    status: "ACTIVE",
    roles: ["VENDOR"],
    permissions: new Set<Permission>([
      "product:create",
      "product:read",
      "product:update",
      "product:delete",
    ]),
    hasVendorProfile: true,
    vendorProfileId: "vendor-a-profile",
    ...overrides,
  };
}

function formData(fields: Record<string, string | File>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value as never);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("createListingAction", () => {
  it("is denied when the caller lacks the create permission", async () => {
    mockAuthorize.mockRejectedValue(new AuthorizationError());

    const result = await createListingAction(
      undefined,
      formData({ kind: "PRODUCT", categoryId: CAT_ID, title: "Widget", price: "1000" }),
    );

    expect(result.success).toBe(false);
    expect(repoMock.create).not.toHaveBeenCalled();
  });

  it("a vendor's own listing is created under their vendorProfileId, never a client-supplied vendorId", async () => {
    mockAuthorize.mockResolvedValue(vendorSession());
    repoMock.create.mockResolvedValue({ id: LISTING_ID });

    const result = await createListingAction(
      undefined,
      formData({
        kind: "PRODUCT",
        categoryId: CAT_ID,
        title: "Widget",
        price: "1000",
        // Tampering attempt: a vendor tries to create a listing under someone else's vendor id.
        vendorId: "vendor-b-profile",
      }),
    );

    expect(result.success).toBe(true);
    expect(repoMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ vendorId: "vendor-a-profile" }),
    );
  });

  it("admin creation requires an explicit vendorId (no implicit vendor)", async () => {
    mockAuthorize.mockResolvedValue(adminSession());

    const result = await createListingAction(
      undefined,
      formData({ kind: "PRODUCT", categoryId: CAT_ID, title: "Widget", price: "1000" }),
    );

    expect(result.success).toBe(false);
    expect(repoMock.create).not.toHaveBeenCalled();
  });

  it("admin can create a listing for any vendor they specify", async () => {
    mockAuthorize.mockResolvedValue(adminSession());
    repoMock.create.mockResolvedValue({ id: LISTING_ID_2 });

    const result = await createListingAction(
      undefined,
      formData({
        kind: "PRODUCT",
        categoryId: CAT_ID,
        title: "Widget",
        price: "1000",
        vendorId: "vendor-b-profile",
      }),
    );

    expect(result.success).toBe(true);
    expect(repoMock.create).toHaveBeenCalledWith(
      expect.objectContaining({ vendorId: "vendor-b-profile" }),
    );
  });
});

describe("updateListingAction — cross-vendor access (Phase 3 brief)", () => {
  it("a vendor CANNOT update another vendor's listing", async () => {
    mockAuthorize.mockResolvedValue(vendorSession());
    repoMock.getById.mockResolvedValue({
      id: LISTING_ID,
      vendorId: "vendor-b-profile", // owned by someone else
      title: "Old title",
      approvalStatus: "APPROVED",
    });

    const result = await updateListingAction(
      undefined,
      formData({
        kind: "PRODUCT",
        id: LISTING_ID,
        categoryId: CAT_ID,
        title: "New title",
        price: "1000",
      }),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("NOT_FOUND");
    expect(repoMock.update).not.toHaveBeenCalled();
  });

  it("a vendor CAN update their own listing", async () => {
    mockAuthorize.mockResolvedValue(vendorSession());
    repoMock.getById.mockResolvedValue({
      id: LISTING_ID,
      vendorId: "vendor-a-profile",
      title: "Old title",
      approvalStatus: "PENDING",
    });
    repoMock.update.mockResolvedValue({ id: LISTING_ID });

    const result = await updateListingAction(
      undefined,
      formData({
        kind: "PRODUCT",
        id: LISTING_ID,
        categoryId: CAT_ID,
        title: "New title",
        price: "1000",
      }),
    );

    expect(result.success).toBe(true);
    expect(repoMock.update).toHaveBeenCalledWith(
      LISTING_ID,
      expect.objectContaining({ title: "New title" }),
    );
  });

  it("editing an already-APPROVED listing resets it to PENDING", async () => {
    mockAuthorize.mockResolvedValue(vendorSession());
    repoMock.getById.mockResolvedValue({
      id: LISTING_ID,
      vendorId: "vendor-a-profile",
      title: "Old title",
      approvalStatus: "APPROVED",
    });
    repoMock.update.mockResolvedValue({ id: LISTING_ID });

    await updateListingAction(
      undefined,
      formData({
        kind: "PRODUCT",
        id: LISTING_ID,
        categoryId: CAT_ID,
        title: "New title",
        price: "1000",
      }),
    );

    expect(repoMock.update).toHaveBeenCalledWith(
      LISTING_ID,
      expect.objectContaining({ approvalStatus: "PENDING", approvedBy: null }),
    );
  });

  it("staff (admin) can update any vendor's listing", async () => {
    mockAuthorize.mockResolvedValue(adminSession());
    repoMock.getById.mockResolvedValue({
      id: LISTING_ID,
      vendorId: "vendor-b-profile",
      title: "Old title",
      approvalStatus: "PENDING",
    });
    repoMock.update.mockResolvedValue({ id: LISTING_ID });

    const result = await updateListingAction(
      undefined,
      formData({
        kind: "PRODUCT",
        id: LISTING_ID,
        categoryId: CAT_ID,
        title: "New title",
        price: "1000",
      }),
    );

    expect(result.success).toBe(true);
  });
});

describe("deleteListingAction — ownership", () => {
  it("a vendor cannot delete another vendor's listing", async () => {
    mockAuthorize.mockResolvedValue(vendorSession());
    repoMock.getById.mockResolvedValue({
      id: LISTING_ID,
      vendorId: "vendor-b-profile",
      title: "X",
    });

    const result = await deleteListingAction(
      undefined,
      formData({ kind: "PRODUCT", id: LISTING_ID }),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("NOT_FOUND");
    expect(repoMock.softDelete).not.toHaveBeenCalled();
  });

  it("soft-deletes (never a hard delete call)", async () => {
    mockAuthorize.mockResolvedValue(vendorSession());
    repoMock.getById.mockResolvedValue({
      id: LISTING_ID,
      vendorId: "vendor-a-profile",
      title: "X",
    });

    const result = await deleteListingAction(
      undefined,
      formData({ kind: "PRODUCT", id: LISTING_ID }),
    );

    expect(result.success).toBe(true);
    expect(repoMock.softDelete).toHaveBeenCalledWith(LISTING_ID);
  });
});

describe("updateListingStatusAction — approval requires elevated permission", () => {
  it("a vendor cannot approve their own listing (no product:approve)", async () => {
    mockAuthorize.mockRejectedValue(new AuthorizationError());

    const result = await updateListingStatusAction(
      undefined,
      formData({ kind: "PRODUCT", id: LISTING_ID, action: "approve" }),
    );

    expect(result.success).toBe(false);
    expect(mockAuthorize).toHaveBeenCalledWith("product:approve");
  });

  it("a vendor CAN deactivate their own listing (product:update, not :approve)", async () => {
    mockAuthorize.mockResolvedValue(vendorSession());
    repoMock.getById.mockResolvedValue({
      id: LISTING_ID,
      vendorId: "vendor-a-profile",
      approvalStatus: "APPROVED",
      isActive: true,
    });

    const result = await updateListingStatusAction(
      undefined,
      formData({ kind: "PRODUCT", id: LISTING_ID, action: "deactivate" }),
    );

    expect(result.success).toBe(true);
    expect(mockAuthorize).toHaveBeenCalledWith("product:update");
    expect(repoMock.update).toHaveBeenCalledWith(LISTING_ID, { isActive: false });
  });

  it("rejects an illegal approval transition (already REJECTED, trying to approve directly)", async () => {
    mockAuthorize.mockResolvedValue(adminSession());
    repoMock.getById.mockResolvedValue({
      id: LISTING_ID,
      vendorId: "vendor-a-profile",
      approvalStatus: "REJECTED",
      isActive: true,
    });

    const result = await updateListingStatusAction(
      undefined,
      formData({ kind: "PRODUCT", id: LISTING_ID, action: "approve" }),
    );

    expect(result.success).toBe(false);
    expect(repoMock.update).not.toHaveBeenCalled();
  });

  it("rejecting requires a reason", async () => {
    mockAuthorize.mockResolvedValue(adminSession());

    const result = await updateListingStatusAction(
      undefined,
      formData({ kind: "PRODUCT", id: LISTING_ID, action: "reject" }),
    );

    expect(result.success).toBe(false);
    expect(repoMock.update).not.toHaveBeenCalled();
  });
});

describe("image upload/delete — ownership + limits", () => {
  const fakeFile = new File(["fake"], "photo.jpg", { type: "image/jpeg" });

  it("a vendor cannot upload an image to another vendor's listing", async () => {
    mockAuthorize.mockResolvedValue(vendorSession());
    repoMock.getById.mockResolvedValue({ id: LISTING_ID, vendorId: "vendor-b-profile" });

    const result = await uploadListingImageAction(
      undefined,
      formData({ kind: "PRODUCT", itemId: LISTING_ID, file: fakeFile }),
    );

    expect(result.success).toBe(false);
    expect(mockUploadCatalogImage).not.toHaveBeenCalled();
  });

  it("refuses to upload past the per-listing image limit", async () => {
    mockAuthorize.mockResolvedValue(vendorSession());
    repoMock.getById.mockResolvedValue({ id: LISTING_ID, vendorId: "vendor-a-profile" });
    repoMock.countImages.mockResolvedValue(8);

    const result = await uploadListingImageAction(
      undefined,
      formData({ kind: "PRODUCT", itemId: LISTING_ID, file: fakeFile }),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("CONFLICT");
    expect(mockUploadCatalogImage).not.toHaveBeenCalled();
  });

  it("uploads and records the image with the correct FK field for the kind", async () => {
    mockAuthorize.mockResolvedValue(vendorSession());
    repoMock.getById.mockResolvedValue({ id: LISTING_ID, vendorId: "vendor-a-profile" });
    repoMock.countImages.mockResolvedValue(0);
    mockUploadCatalogImage.mockResolvedValue({ storagePath: "product/listing-1/abc.jpg" });
    repoMock.addImage.mockResolvedValue({ id: IMAGE_ID, storagePath: "product/listing-1/abc.jpg" });

    const result = await uploadListingImageAction(
      undefined,
      formData({ kind: "PRODUCT", itemId: LISTING_ID, file: fakeFile }),
    );

    expect(result.success).toBe(true);
    expect(repoMock.addImage).toHaveBeenCalledWith(
      expect.objectContaining({ productId: LISTING_ID, storagePath: "product/listing-1/abc.jpg" }),
    );
  });

  it("a vendor cannot delete an image belonging to another vendor's listing", async () => {
    mockAuthorize.mockResolvedValue(vendorSession());
    repoMock.getImage.mockResolvedValue({
      id: IMAGE_ID,
      productId: LISTING_ID,
      storagePath: "x.jpg",
    });
    repoMock.getById.mockResolvedValue({ id: LISTING_ID, vendorId: "vendor-b-profile" });

    const result = await deleteListingImageAction(
      undefined,
      formData({ kind: "PRODUCT", imageId: IMAGE_ID }),
    );

    expect(result.success).toBe(false);
    expect(mockDeleteCatalogImage).not.toHaveBeenCalled();
    expect(repoMock.removeImage).not.toHaveBeenCalled();
  });
});

describe("createCategoryAction", () => {
  it("rejects a duplicate category name (case/slug collision)", async () => {
    mockAuthorize.mockResolvedValue(adminSession());
    repoMock.listCategories.mockResolvedValue([{ id: CAT_ID, slug: "widgets" }]);

    const result = await createCategoryAction(
      undefined,
      formData({ kind: "PRODUCT", name: "Widgets" }),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("CONFLICT");
    expect(repoMock.createCategory).not.toHaveBeenCalled();
  });

  it("creates a new category", async () => {
    mockAuthorize.mockResolvedValue(adminSession());
    repoMock.listCategories.mockResolvedValue([]);
    repoMock.createCategory.mockResolvedValue({ id: "cat-2" });

    const result = await createCategoryAction(
      undefined,
      formData({ kind: "PRODUCT", name: "Gadgets" }),
    );

    expect(result.success).toBe(true);
    expect(repoMock.createCategory).toHaveBeenCalledWith(
      expect.objectContaining({ name: "Gadgets", slug: "gadgets" }),
    );
  });
});
