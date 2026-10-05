import { z } from "zod";
import { VendorApprovalStatus } from "@/generated/prisma/enums";

/**
 * Vendor management — admin-initiated creation/status lifecycle plus the
 * vendor's own self-service profile edit. See docs/rbac.md §4 (`vendor:*`
 * permissions) and docs/adr/0010-vendor-profile-and-dynamic-roles.md.
 */

export const createVendorSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  businessName: z.string().trim().min(2, "Enter a business name.").max(200),
  fullName: z.string().trim().min(2, "Enter the contact person's name.").max(200),
});
export type CreateVendorInput = z.infer<typeof createVendorSchema>;

const VENDOR_STATUS_TRANSITIONS = [
  VendorApprovalStatus.APPROVED,
  VendorApprovalStatus.REJECTED,
  VendorApprovalStatus.SUSPENDED,
] as const;

export const updateVendorStatusSchema = z
  .object({
    status: z.enum(VENDOR_STATUS_TRANSITIONS),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((data) => data.status !== VendorApprovalStatus.REJECTED || !!data.reason?.length, {
    message: "A reason is required when rejecting a vendor.",
    path: ["reason"],
  });
export type UpdateVendorStatusInput = z.infer<typeof updateVendorStatusSchema>;

export const updateVendorProfileSchema = z.object({
  businessName: z.string().trim().min(2, "Enter a business name.").max(200),
});
export type UpdateVendorProfileInput = z.infer<typeof updateVendorProfileSchema>;

export const vendorListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  status: z.enum(VendorApprovalStatus).optional(),
  sortBy: z.enum(["businessName", "createdAt", "approvalStatus"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type VendorListQuery = z.infer<typeof vendorListQuerySchema>;
