// Deliberately NO "server-only" import: same exception and rationale as wallet-repository.ts. Tests run the
// vendor and seller actions against a fake database client, and the only dependency
// (`@/server/lib/prisma`) carries the guard.
import { prisma } from "@/server/lib/prisma";
import { VendorApprovalStatus } from "@/generated/prisma/enums";
import type { Prisma } from "@/generated/prisma/client";

type Tx = Prisma.TransactionClient;

export function findVendorProfileById(id: string) {
  return prisma.vendorProfile.findUnique({ where: { id } });
}

/** A vendor account made by an admin: the sign-in user, its VENDOR role and a pending profile, together. */
export function createVendorAccount(input: {
  userId: string;
  email: string;
  fullName: string;
  createdBy: string;
  roleId: string;
  businessName: string;
  phone: string;
}) {
  return prisma.$transaction(async (tx) => {
    await tx.user.create({
      data: {
        id: input.userId,
        email: input.email,
        fullName: input.fullName,
        status: "PENDING_VERIFICATION",
        createdBy: input.createdBy,
      },
    });
    await tx.userRole.create({
      data: { userId: input.userId, roleId: input.roleId, grantedBy: input.createdBy },
    });
    await tx.vendorProfile.create({
      data: {
        userId: input.userId,
        businessName: input.businessName,
        phone: input.phone,
        approvalStatus: VendorApprovalStatus.PENDING,
      },
    });
  });
}

/** Gives the VENDOR role if the person does not hold it already. Safe to run twice. */
async function grantVendorRole(tx: Tx, userId: string, grantedBy: string) {
  const role = await tx.role.findUnique({ where: { code: "VENDOR" } });
  if (!role) throw new Error("The VENDOR role is not seeded. Run the seed script.");
  const existing = await tx.userRole.findFirst({
    where: { userId, roleId: role.id, revokedAt: null },
    select: { id: true },
  });
  if (!existing) await tx.userRole.create({ data: { userId, roleId: role.id, grantedBy } });
}

/**
 * Moves a vendor to a new approval status, only if it still has the status the caller validated the move
 * against (a concurrent change matches 0 rows instead of being overwritten). Approving also gives the person
 * the VENDOR role in the same transaction. Returns false when someone else changed it first.
 */
export function changeVendorApprovalStatus(input: {
  vendorProfileId: string;
  expectedStatus: VendorApprovalStatus;
  status: VendorApprovalStatus;
  reason: string | undefined;
  decidedBy: string;
  applicantUserId: string;
}): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.vendorProfile.updateMany({
      where: { id: input.vendorProfileId, approvalStatus: input.expectedStatus },
      data: {
        approvalStatus: input.status,
        approvedBy: input.decidedBy,
        approvedAt: new Date(),
        rejectedReason: input.status === VendorApprovalStatus.REJECTED ? input.reason : null,
      },
    });
    if (count === 0) return false;
    if (input.status === VendorApprovalStatus.APPROVED) {
      await grantVendorRole(tx, input.applicantUserId, input.decidedBy);
    }
    return true;
  });
}

export function updateVendorProfileDetails(
  id: string,
  data: {
    businessName: string;
    phone: string;
    telephone: string | null;
    gstin: string | null;
    pan: string | null;
  },
) {
  return prisma.vendorProfile.update({ where: { id }, data });
}

/** Whether this user already applied, and where that application stands. */
export function findVendorApplication(userId: string) {
  return prisma.vendorProfile.findUnique({
    where: { userId },
    select: { id: true, approvalStatus: true },
  });
}

export function createPendingVendorProfile(
  userId: string,
  data: { businessName: string; phone: string; gstin: string | null },
) {
  return prisma.vendorProfile.create({
    data: { userId, approvalStatus: VendorApprovalStatus.PENDING, ...data },
    select: { id: true },
  });
}

/** Sends a rejected application back for review, only while it is still rejected. Returns rows changed. */
export async function resubmitRejectedVendorProfile(
  id: string,
  data: { businessName: string; phone: string; gstin: string | null },
): Promise<number> {
  const { count } = await prisma.vendorProfile.updateMany({
    where: { id, approvalStatus: VendorApprovalStatus.REJECTED },
    data: { ...data, approvalStatus: VendorApprovalStatus.PENDING, rejectedReason: null },
  });
  return count;
}
