import { describe, expect, it, vi, beforeEach } from "vitest";
import { AuthorizationError } from "@/server/lib/errors";
import type { AuthSession } from "@/server/auth/session";

/**
 * The member's own "become a seller" request, with Prisma and the other boundaries mocked (no live
 * database here). What matters: the applicant is always the signed-in person, a request only ever
 * creates a PENDING profile (never a role), and approvers are told.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockRecordAudit = vi.fn();
vi.mock("@/server/domain/audit/record", () => ({ recordAudit: mockRecordAudit }));

const mockAuthorize = vi.fn();
vi.mock("@/server/auth/authorize", () => ({ authorize: mockAuthorize }));

const mockCreateNotification = vi.fn();
vi.mock("@/server/repositories/identity/notification-repository", () => ({
  createNotification: mockCreateNotification,
}));

const mockApprovers = vi.fn();
vi.mock("@/server/repositories/ads/ad-repository", () => ({
  userIdsWithPermission: mockApprovers,
}));

const prismaMock = {
  vendorProfile: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() },
  userRole: { create: vi.fn() },
};
vi.mock("@/server/lib/prisma", () => ({ prisma: prismaMock }));

const { requestSellerAccessAction } = await import("@/server/services/seller-actions");

function session(): AuthSession {
  return {
    userId: "member-1",
    email: "member@example.com",
    fullName: "Member",
    status: "ACTIVE",
    roles: ["CUSTOMER"],
    permissions: new Set(["vendor:apply"]),
    hasVendorProfile: false,
    hasMemberProfile: true,
    vendorProfileId: null,
  };
}

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const VALID = { businessName: "Sharma Traders", phone: "+919876543210" };

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthorize.mockResolvedValue(session());
  mockApprovers.mockResolvedValue(["super-1"]);
  mockCreateNotification.mockResolvedValue({});
  prismaMock.vendorProfile.findUnique.mockResolvedValue(null);
  prismaMock.vendorProfile.create.mockResolvedValue({ id: "vp-new" });
  prismaMock.vendorProfile.updateMany.mockResolvedValue({ count: 1 });
});

describe("requestSellerAccessAction", () => {
  it("needs the vendor:apply permission", async () => {
    mockAuthorize.mockRejectedValue(new AuthorizationError());
    const result = await requestSellerAccessAction(undefined, form(VALID));
    expect(result.success).toBe(false);
    expect(mockAuthorize).toHaveBeenCalledWith("vendor:apply");
    expect(prismaMock.vendorProfile.create).not.toHaveBeenCalled();
  });

  it("creates a PENDING profile for the signed-in person only, and never grants a role", async () => {
    const result = await requestSellerAccessAction(undefined, form(VALID));

    expect(result.success).toBe(true);
    expect(prismaMock.vendorProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: "member-1",
          approvalStatus: "PENDING",
          businessName: "Sharma Traders",
        }),
      }),
    );
    expect(prismaMock.userRole.create).not.toHaveBeenCalled();
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "SELLER_APPLIED", actorId: "member-1" }),
    );
  });

  it("ignores any user id sent in the form", async () => {
    await requestSellerAccessAction(undefined, form({ ...VALID, userId: "someone-else" }));
    expect(prismaMock.vendorProfile.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ userId: "member-1" }) }),
    );
  });

  it("tells everyone who can approve sellers", async () => {
    await requestSellerAccessAction(undefined, form(VALID));
    expect(mockApprovers).toHaveBeenCalledWith("vendor:approve");
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "super-1", type: "SELLER_REQUEST" }),
    );
  });

  it("still succeeds when a notification cannot be delivered", async () => {
    mockCreateNotification.mockRejectedValue(new Error("down"));
    const result = await requestSellerAccessAction(undefined, form(VALID));
    expect(result.success).toBe(true);
  });

  it("rejects a missing business name or a bad mobile number", async () => {
    const noName = await requestSellerAccessAction(undefined, form({ ...VALID, businessName: "" }));
    const badPhone = await requestSellerAccessAction(undefined, form({ ...VALID, phone: "12345" }));
    expect(noName.success).toBe(false);
    expect(badPhone.success).toBe(false);
    expect(prismaMock.vendorProfile.create).not.toHaveBeenCalled();
  });

  it("does not let a second request through while one is pending", async () => {
    prismaMock.vendorProfile.findUnique.mockResolvedValue({ id: "vp-1", approvalStatus: "PENDING" });
    const result = await requestSellerAccessAction(undefined, form(VALID));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("CONFLICT");
    expect(prismaMock.vendorProfile.create).not.toHaveBeenCalled();
  });

  it("does not let an approved seller apply again", async () => {
    prismaMock.vendorProfile.findUnique.mockResolvedValue({ id: "vp-1", approvalStatus: "APPROVED" });
    const result = await requestSellerAccessAction(undefined, form(VALID));
    expect(result.success).toBe(false);
  });

  it("lets a rejected request be sent again, back to PENDING", async () => {
    prismaMock.vendorProfile.findUnique.mockResolvedValue({ id: "vp-1", approvalStatus: "REJECTED" });
    const result = await requestSellerAccessAction(undefined, form(VALID));

    expect(result.success).toBe(true);
    expect(prismaMock.vendorProfile.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "vp-1", approvalStatus: "REJECTED" },
        data: expect.objectContaining({ approvalStatus: "PENDING", rejectedReason: null }),
      }),
    );
    expect(prismaMock.vendorProfile.create).not.toHaveBeenCalled();
  });
});
