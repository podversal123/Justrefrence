import { describe, expect, it, vi, beforeEach } from "vitest";
import { AuthorizationError } from "@/server/lib/errors";
import type { AuthSession } from "@/server/auth/session";
import type { Permission } from "@/server/auth/permissions";

/**
 * Integration-style tests for the vendor Server Action layer, with Prisma
 * and Supabase mocked at the module boundary (no live database in this
 * environment — see docs/testing.md §3). These verify the WIRING: that
 * authorize() is actually called with the right permission, that ownership
 * is enforced structurally, and that invalid state transitions are
 * rejected — not Prisma's own correctness, which is out of scope here.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockRecordAudit = vi.fn();
vi.mock("@/server/domain/audit/record", () => ({ recordAudit: mockRecordAudit }));

const mockGetVendorProfileByUserId = vi.fn();
vi.mock("@/server/repositories/vendor-repository", () => ({
  getVendorProfileByUserId: mockGetVendorProfileByUserId,
}));

const mockAuthorize = vi.fn();
vi.mock("@/server/auth/authorize", () => ({ authorize: mockAuthorize }));

const mockGetUser = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser } })),
}));

const mockInviteUserByEmail = vi.fn();
const mockDeleteUser = vi.fn().mockResolvedValue({ data: {}, error: null });
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    auth: { admin: { inviteUserByEmail: mockInviteUserByEmail, deleteUser: mockDeleteUser } },
  })),
}));

const prismaMock = {
  user: { findUnique: vi.fn(), create: vi.fn() },
  role: { findUnique: vi.fn() },
  vendorProfile: {
    findUnique: vi.fn(),
    update: vi.fn(),
    updateMany: vi.fn(),
    create: vi.fn(),
  },
  userRole: { create: vi.fn() },
  $transaction: vi.fn(async (arg: unknown) => {
    if (typeof arg === "function") {
      return (arg as (tx: typeof prismaMock) => unknown)(prismaMock);
    }
    return Promise.all(arg as Promise<unknown>[]);
  }),
};
vi.mock("@/server/lib/prisma", () => ({ prisma: prismaMock }));

const { createVendorAction, updateVendorStatusAction, updateVendorProfileAction } =
  await import("@/server/services/vendor-actions");

function session(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    userId: "admin-1",
    email: "admin@example.com",
    fullName: "Admin",
    status: "ACTIVE",
    roles: ["ADMIN"],
    permissions: new Set<Permission>([
      "user:create",
      "vendor:approve",
      "vendor:reject",
      "vendor:suspend",
    ]),
    hasVendorProfile: false,
    vendorProfileId: null,
    ...overrides,
  };
}

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.vendorProfile.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === "function") {
      return (arg as (tx: typeof prismaMock) => unknown)(prismaMock);
    }
    return Promise.all(arg as Promise<unknown>[]);
  });
});

describe("createVendorAction", () => {
  it("is denied when the caller lacks user:create", async () => {
    mockAuthorize.mockRejectedValue(new AuthorizationError());

    const result = await createVendorAction(
      undefined,
      formData({ email: "v@example.com", businessName: "Acme", fullName: "Jane" }),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("FORBIDDEN");
    expect(mockInviteUserByEmail).not.toHaveBeenCalled();
  });

  it("creates the user, VENDOR role grant, and a PENDING vendor profile atomically", async () => {
    mockAuthorize.mockResolvedValue(session());
    prismaMock.user.findUnique.mockResolvedValue(null); // no existing account
    prismaMock.role.findUnique.mockResolvedValue({ id: "role-vendor", code: "VENDOR" });
    mockInviteUserByEmail.mockResolvedValue({ data: { user: { id: "new-user-1" } }, error: null });

    const result = await createVendorAction(
      undefined,
      formData({ email: "v@example.com", businessName: "Acme", fullName: "Jane" }),
    );

    expect(result.success).toBe(true);
    expect(mockAuthorize).toHaveBeenCalledWith("user:create");
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(1);
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "VENDOR_CREATED", entityId: "new-user-1" }),
    );
  });

  it("rejects when an account with that email already exists", async () => {
    mockAuthorize.mockResolvedValue(session());
    prismaMock.user.findUnique.mockResolvedValue({ id: "existing" });

    const result = await createVendorAction(
      undefined,
      formData({ email: "v@example.com", businessName: "Acme", fullName: "Jane" }),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("CONFLICT");
    expect(mockInviteUserByEmail).not.toHaveBeenCalled();
  });
});

describe("updateVendorStatusAction — state machine", () => {
  it("requires vendor:approve to move PENDING -> APPROVED", async () => {
    mockAuthorize.mockRejectedValue(new AuthorizationError());

    const result = await updateVendorStatusAction(
      undefined,
      formData({ vendorProfileId: "vp-1", status: "APPROVED" }),
    );

    expect(result.success).toBe(false);
    expect(mockAuthorize).toHaveBeenCalledWith("vendor:approve");
  });

  it("requires vendor:suspend (not vendor:approve) to suspend an approved vendor", async () => {
    mockAuthorize.mockResolvedValue(session());

    await updateVendorStatusAction(
      undefined,
      formData({ vendorProfileId: "vp-1", status: "SUSPENDED" }),
    );

    expect(mockAuthorize).toHaveBeenCalledWith("vendor:suspend");
  });

  it("rejects an illegal transition (PENDING directly to SUSPENDED)", async () => {
    mockAuthorize.mockResolvedValue(session());
    prismaMock.vendorProfile.findUnique.mockResolvedValue({
      id: "vp-1",
      approvalStatus: "PENDING",
    });

    const result = await updateVendorStatusAction(
      undefined,
      formData({ vendorProfileId: "vp-1", status: "SUSPENDED" }),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("CONFLICT");
    expect(prismaMock.vendorProfile.update).not.toHaveBeenCalled();
  });

  it("allows PENDING -> APPROVED and records who approved it", async () => {
    mockAuthorize.mockResolvedValue(session());
    prismaMock.vendorProfile.findUnique.mockResolvedValue({
      id: "vp-1",
      approvalStatus: "PENDING",
    });

    const result = await updateVendorStatusAction(
      undefined,
      formData({ vendorProfileId: "vp-1", status: "APPROVED" }),
    );

    expect(result.success).toBe(true);
    expect(prismaMock.vendorProfile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "vp-1", approvalStatus: "PENDING" },
        data: expect.objectContaining({ approvalStatus: "APPROVED", approvedBy: "admin-1" }),
      }),
    );
  });

  it("returns CONFLICT (no audit entry) when a concurrent change already moved the status", async () => {
    mockAuthorize.mockResolvedValue(session());
    prismaMock.vendorProfile.findUnique.mockResolvedValue({
      id: "vp-1",
      approvalStatus: "PENDING",
    });
    prismaMock.vendorProfile.updateMany.mockResolvedValue({ count: 0 });

    const result = await updateVendorStatusAction(
      undefined,
      formData({ vendorProfileId: "vp-1", status: "APPROVED" }),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("CONFLICT");
  });

  it("404s when the vendor doesn't exist", async () => {
    mockAuthorize.mockResolvedValue(session());
    prismaMock.vendorProfile.findUnique.mockResolvedValue(null);

    const result = await updateVendorStatusAction(
      undefined,
      formData({ vendorProfileId: "does-not-exist", status: "APPROVED" }),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("NOT_FOUND");
  });
});

describe("updateVendorProfileAction — cross-vendor access", () => {
  it("updates ONLY the caller's own vendor profile, even if a client tries to smuggle another vendor's id", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "vendor-a-user" } } });
    mockGetVendorProfileByUserId.mockResolvedValue({
      id: "vendor-a-profile",
      userId: "vendor-a-user",
      businessName: "Old Name",
    });

    // A tampering attempt: the form includes a foreign vendorProfileId, but
    // the action never reads that field — see src/server/services/vendor-actions.ts.
    const tamperedForm = formData({
      businessName: "New Name",
      vendorProfileId: "vendor-b-profile",
    });

    const result = await updateVendorProfileAction(undefined, tamperedForm);

    expect(result.success).toBe(true);
    // The lookup was always by the CALLER's user id, never by anything in the form.
    expect(mockGetVendorProfileByUserId).toHaveBeenCalledWith("vendor-a-user");
    expect(mockGetVendorProfileByUserId).not.toHaveBeenCalledWith("vendor-b-profile");
    expect(prismaMock.vendorProfile.update).toHaveBeenCalledWith({
      where: { id: "vendor-a-profile" },
      data: { businessName: "New Name" },
    });
    // Vendor B's profile is never touched.
    expect(prismaMock.vendorProfile.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "vendor-b-profile" } }),
    );
  });

  it("returns NOT_FOUND rather than another vendor's data when the caller has no vendor profile", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: "customer-1" } } });
    mockGetVendorProfileByUserId.mockResolvedValue(null);

    const result = await updateVendorProfileAction(
      undefined,
      formData({ businessName: "New Name" }),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("NOT_FOUND");
    expect(prismaMock.vendorProfile.update).not.toHaveBeenCalled();
  });

  it("requires an authenticated session", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await updateVendorProfileAction(
      undefined,
      formData({ businessName: "New Name" }),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("UNAUTHENTICATED");
  });
});
