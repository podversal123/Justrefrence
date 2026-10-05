import { z } from "zod";
import { passwordRules } from "@/lib/schemas/auth";

/**
 * Admin account management — see docs/rbac.md and the Phase 2 brief's
 * "ADMIN" feature list (create admin, change profile, change password).
 */

export const createAdminSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  fullName: z.string().trim().min(2, "Enter a full name.").max(200),
  roleId: z.string().uuid("Choose a role."),
});
export type CreateAdminInput = z.infer<typeof createAdminSchema>;

export const updateProfileSchema = z.object({
  fullName: z.string().trim().min(2, "Enter a full name.").max(200),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password."),
    newPassword: passwordRules,
    confirmNewPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmNewPassword, {
    message: "Passwords do not match.",
    path: ["confirmNewPassword"],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "New password must be different from your current password.",
    path: ["newPassword"],
  });
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
