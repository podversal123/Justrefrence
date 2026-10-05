import { describe, expect, it, vi, beforeEach } from "vitest";
import { AuthorizationError } from "@/server/lib/errors";
import type { AuthSession } from "@/server/auth/session";
import type { Permission } from "@/server/auth/permissions";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/server/domain/audit/record", () => ({ recordAudit: vi.fn() }));

const mockAuthorize = vi.fn();
vi.mock("@/server/auth/authorize", () => ({ authorize: mockAuthorize }));

const prismaMock = {
  role: { findUnique: vi.fn(), create: vi.fn() },
  permission: { findMany: vi.fn() },
  rolePermission: { deleteMany: vi.fn(), createMany: vi.fn() },
  user: { findUnique: vi.fn() },
  userRole: {
    findFirst: vi.fn(),
    findUnique: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    count: vi.fn(),
  },
  auditLog: { create: vi.fn().mockResolvedValue({}) },
  $transaction: vi.fn(async (arg: unknown) => {
    if (typeof arg === "function") {
      return (arg as (tx: typeof prismaMock) => unknown)(prismaMock);
    }
    return Promise.all(arg as Promise<unknown>[]);
  }),
};
vi.mock("@/server/lib/prisma", () => ({ prisma: prismaMock }));

const { createRoleAction, assignRoleAction, removeRoleAction, updateRolePermissionsAction } =
  await import("@/server/services/role-actions");

function superAdminSession(overrides: Partial<AuthSession> = {}): AuthSession {
  return {
    userId: "super-1",
    email: "super@example.com",
    fullName: "Super Admin",
    status: "ACTIVE",
    roles: ["SUPER_ADMIN"],
    permissions: new Set<Permission>(["role:assign", "permission:update"]),
    hasVendorProfile: false,
    vendorProfileId: null,
    ...overrides,
  };
}

function formData(fields: Record<string, string | string[]>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (Array.isArray(value)) value.forEach((v) => fd.append(key, v));
    else fd.set(key, value);
  }
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  prismaMock.$transaction.mockImplementation(async (arg: unknown) => {
    if (typeof arg === "function") {
      return (arg as (tx: typeof prismaMock) => unknown)(prismaMock);
    }
    return Promise.all(arg as Promise<unknown>[]);
  });
});

describe("createRoleAction", () => {
  it("is denied without permission:update", async () => {
    mockAuthorize.mockRejectedValue(new AuthorizationError());
    const result = await createRoleAction(
      undefined,
      formData({ code: "TEST", label: "Test", permissionCodes: ["product:read"] }),
    );
    expect(result.success).toBe(false);
    expect(prismaMock.role.create).not.toHaveBeenCalled();
  });

  it("rejects a duplicate role code", async () => {
    mockAuthorize.mockResolvedValue(superAdminSession());
    prismaMock.role.findUnique.mockResolvedValue({ id: "existing", code: "VENDOR" });

    const result = await createRoleAction(
      undefined,
      formData({ code: "VENDOR", label: "Vendor again", permissionCodes: [] }),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("CONFLICT");
  });

  it("creates a role composed only from the submitted, valid permission codes", async () => {
    mockAuthorize.mockResolvedValue(superAdminSession());
    prismaMock.role.findUnique.mockResolvedValue(null);
    prismaMock.permission.findMany.mockResolvedValue([
      { id: "perm-1", code: "product:read" },
      { id: "perm-2", code: "product:update" },
    ]);
    prismaMock.role.create.mockResolvedValue({ id: "role-new", code: "CATALOG_MANAGER" });

    const result = await createRoleAction(
      undefined,
      formData({
        code: "CATALOG_MANAGER",
        label: "Catalog Manager",
        permissionCodes: ["product:read", "product:update"],
      }),
    );

    expect(result.success).toBe(true);
    expect(prismaMock.rolePermission.createMany).toHaveBeenCalledWith({
      data: [
        { roleId: "role-new", permissionId: "perm-1" },
        { roleId: "role-new", permissionId: "perm-2" },
      ],
    });
  });
});

describe("updateRolePermissionsAction", () => {
  it("replaces the role's permission set (delete then recreate)", async () => {
    mockAuthorize.mockResolvedValue(superAdminSession());
    prismaMock.role.findUnique.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      rolePermissions: [{ permission: { code: "product:read" } }],
    });
    prismaMock.permission.findMany.mockResolvedValue([{ id: "perm-2", code: "product:update" }]);

    const result = await updateRolePermissionsAction(
      undefined,
      formData({
        roleId: "11111111-1111-4111-8111-111111111111",
        permissionCodes: ["product:update"],
      }),
    );

    expect(result.success).toBe(true);
    expect(prismaMock.rolePermission.deleteMany).toHaveBeenCalledWith({
      where: { roleId: "11111111-1111-4111-8111-111111111111" },
    });
    expect(prismaMock.rolePermission.createMany).toHaveBeenCalledWith({
      data: [{ roleId: "11111111-1111-4111-8111-111111111111", permissionId: "perm-2" }],
    });
  });
});

describe("assignRoleAction", () => {
  it("rejects assigning a role the user already actively holds", async () => {
    mockAuthorize.mockResolvedValue(superAdminSession());
    prismaMock.user.findUnique.mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222" });
    prismaMock.role.findUnique.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      code: "SUPPORT",
    });
    prismaMock.userRole.findFirst.mockResolvedValue({ id: "existing-grant" });

    const result = await assignRoleAction(
      undefined,
      formData({
        userId: "22222222-2222-4222-8222-222222222222",
        roleId: "11111111-1111-4111-8111-111111111111",
      }),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("CONFLICT");
    expect(prismaMock.userRole.create).not.toHaveBeenCalled();
  });

  it("grants the role and audits who granted it", async () => {
    mockAuthorize.mockResolvedValue(superAdminSession());
    prismaMock.user.findUnique.mockResolvedValue({ id: "22222222-2222-4222-8222-222222222222" });
    prismaMock.role.findUnique.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      code: "SUPPORT",
    });
    prismaMock.userRole.findFirst.mockResolvedValue(null);
    prismaMock.userRole.create.mockResolvedValue({ id: "33333333-3333-4333-8333-333333333333" });

    const result = await assignRoleAction(
      undefined,
      formData({
        userId: "22222222-2222-4222-8222-222222222222",
        roleId: "11111111-1111-4111-8111-111111111111",
      }),
    );

    expect(result.success).toBe(true);
    expect(prismaMock.userRole.create).toHaveBeenCalledWith({
      data: {
        userId: "22222222-2222-4222-8222-222222222222",
        roleId: "11111111-1111-4111-8111-111111111111",
        grantedBy: "super-1",
      },
    });
  });
});

describe("removeRoleAction — RBAC integrity", () => {
  it("refuses to remove the last active SUPER_ADMIN", async () => {
    mockAuthorize.mockResolvedValue(superAdminSession());
    prismaMock.userRole.findUnique.mockResolvedValue({
      id: "33333333-3333-4333-8333-333333333333",
      revokedAt: null,
      userId: "super-1",
      role: { code: "SUPER_ADMIN" },
    });
    prismaMock.userRole.count.mockResolvedValue(1);

    const result = await removeRoleAction(
      undefined,
      formData({ userRoleId: "33333333-3333-4333-8333-333333333333" }),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("CONFLICT");
    expect(prismaMock.userRole.update).not.toHaveBeenCalled();
  });

  it("allows removing a SUPER_ADMIN grant when another one still exists", async () => {
    mockAuthorize.mockResolvedValue(superAdminSession());
    prismaMock.userRole.findUnique.mockResolvedValue({
      id: "33333333-3333-4333-8333-333333333333",
      revokedAt: null,
      userId: "super-2",
      role: { code: "SUPER_ADMIN" },
    });
    prismaMock.userRole.count.mockResolvedValue(2);

    const result = await removeRoleAction(
      undefined,
      formData({ userRoleId: "33333333-3333-4333-8333-333333333333" }),
    );

    expect(result.success).toBe(true);
    expect(prismaMock.userRole.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "33333333-3333-4333-8333-333333333333" } }),
    );
  });

  it("allows removing a non-SUPER_ADMIN role without the last-admin check", async () => {
    mockAuthorize.mockResolvedValue(superAdminSession());
    prismaMock.userRole.findUnique.mockResolvedValue({
      id: "44444444-4444-4444-8444-444444444444",
      revokedAt: null,
      userId: "vendor-1",
      role: { code: "VENDOR" },
    });

    const result = await removeRoleAction(
      undefined,
      formData({ userRoleId: "44444444-4444-4444-8444-444444444444" }),
    );

    expect(result.success).toBe(true);
    expect(prismaMock.userRole.count).not.toHaveBeenCalled();
  });

  it("404s on an already-revoked grant", async () => {
    mockAuthorize.mockResolvedValue(superAdminSession());
    prismaMock.userRole.findUnique.mockResolvedValue({
      id: "55555555-5555-4555-8555-555555555555",
      revokedAt: new Date(),
      role: { code: "VENDOR" },
    });

    const result = await removeRoleAction(
      undefined,
      formData({ userRoleId: "55555555-5555-4555-8555-555555555555" }),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("NOT_FOUND");
  });
});
