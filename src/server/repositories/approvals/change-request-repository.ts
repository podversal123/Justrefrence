// Deliberately NO "server-only" import: same exception and rationale as wallet-repository.ts. The approval flow is
// tested against a fake database client, and the only dependency (`@/server/lib/prisma`) carries the guard.
import { prisma } from "@/server/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import type { Tx } from "@/server/repositories/transaction";

/** People who can approve changes: active accounts holding `change:review` through a role that is still granted. */
export async function findChangeReviewerIds(limit = 50): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      userRoles: {
        some: {
          revokedAt: null,
          role: { rolePermissions: { some: { permission: { code: "change:review" } } } },
        },
      },
    },
    select: { id: true },
    take: limit,
  });
  return users.map((u) => u.id);
}

export function createChangeRequest(data: Prisma.ChangeRequestUncheckedCreateInput) {
  return prisma.changeRequest.create({ data, select: { id: true } });
}

export function findChangeRequestById(id: string) {
  return prisma.changeRequest.findUnique({ where: { id } });
}

/** Rejects a request only while it is still pending. Returns how many rows changed (0 = someone decided first). */
export async function rejectPendingChangeRequest(
  id: string,
  data: Prisma.ChangeRequestUncheckedUpdateManyInput,
): Promise<number> {
  const result = await prisma.changeRequest.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "REJECTED", ...data },
  });
  return result.count;
}

/** Approves a request only while it is still pending, inside the transaction that also applies the change. */
export async function approvePendingChangeRequest(
  tx: Tx,
  id: string,
  data: Prisma.ChangeRequestUncheckedUpdateManyInput,
): Promise<number> {
  const result = await tx.changeRequest.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "APPROVED", ...data },
  });
  return result.count;
}

/** The member fields a change request can touch, as they are now. */
export function loadMemberForChange(userId: string) {
  return prisma.user.findUnique({
    where: { id: userId },
    select: {
      fullName: true,
      email: true,
      memberProfile: {
        select: {
          dob: true,
          pan: true,
          gstin: true,
          telephone: true,
          websiteUrl: true,
          socialLinks: true,
        },
      },
    },
  });
}

/** The vendor fields a change request can touch, as they are now. */
export function loadVendorForChange(vendorProfileId: string) {
  return prisma.vendorProfile.findUnique({
    where: { id: vendorProfileId },
    select: { businessName: true, phone: true, telephone: true, gstin: true, pan: true },
  });
}

export function updateUserFullNameInTx(tx: Tx, userId: string, fullName: string | null) {
  return tx.user.update({ where: { id: userId }, data: { fullName } });
}

export function updateMemberProfileInTx(tx: Tx, userId: string, data: Prisma.MemberProfileUpdateInput) {
  return tx.memberProfile.update({ where: { userId }, data });
}

export function updateVendorProfileInTx(tx: Tx, vendorProfileId: string, data: Prisma.VendorProfileUpdateInput) {
  return tx.vendorProfile.update({ where: { id: vendorProfileId }, data });
}

type ListingKind = "PRODUCT" | "SERVICE" | "PROJECT";

/**
 * Prisma gives each model its own delegate type; the product, service and project tables share the same shape
 * for what is needed here, so they are reached through one small, explicit lookup instead of three copies.
 */
type AnyDelegate = any;

function listingDelegates(client: Tx | typeof prisma, kind: ListingKind) {
  switch (kind) {
    case "PRODUCT":
      return {
        item: client.product as AnyDelegate,
        category: client.productCategory as AnyDelegate,
        subcategory: client.productSubcategory as AnyDelegate,
      };
    case "SERVICE":
      return {
        item: client.service as AnyDelegate,
        category: client.serviceCategory as AnyDelegate,
        subcategory: client.serviceSubcategory as AnyDelegate,
      };
    case "PROJECT":
      return {
        item: client.project as AnyDelegate,
        category: client.projectCategory as AnyDelegate,
        subcategory: client.projectSubcategory as AnyDelegate,
      };
  }
}

export function findListingForChange(kind: ListingKind, id: string) {
  return listingDelegates(prisma, kind).item.findUnique({ where: { id } });
}

/** The readable names of a listing's category and subcategory (null for an id that is not given). */
export function findListingCategoryNames(
  kind: ListingKind,
  categoryId: string | null | undefined,
  subcategoryId: string | null | undefined,
) {
  const d = listingDelegates(prisma, kind);
  return Promise.all([
    categoryId ? d.category.findUnique({ where: { id: categoryId }, select: { name: true } }) : null,
    subcategoryId
      ? d.subcategory.findUnique({ where: { id: subcategoryId }, select: { name: true } })
      : null,
  ]);
}

export function updateListingInTx(
  tx: Tx,
  kind: ListingKind,
  id: string,
  data: Record<string, unknown>,
) {
  return listingDelegates(tx, kind).item.update({ where: { id }, data });
}
