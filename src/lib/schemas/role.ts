import { z } from "zod";
import { PERMISSIONS } from "@/server/auth/permissions";

/**
 * Role management — see docs/rbac.md and
 * docs/adr/0010-vendor-profile-and-dynamic-roles.md. A role is always
 * composed from the fixed PERMISSIONS catalog — "create role" never invents
 * a new permission code.
 */

const roleCodePattern = /^[A-Z][A-Z0-9_]{1,49}$/;

export const createRoleSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(roleCodePattern, "Use UPPER_SNAKE_CASE, letters/numbers/underscores only."),
  label: z.string().trim().min(2, "Enter a display label.").max(100),
  permissionCodes: z.array(z.enum(PERMISSIONS)).default([]),
});
export type CreateRoleInput = z.infer<typeof createRoleSchema>;

export const updateRolePermissionsSchema = z.object({
  roleId: z.string().uuid(),
  permissionCodes: z.array(z.enum(PERMISSIONS)),
});
export type UpdateRolePermissionsInput = z.infer<typeof updateRolePermissionsSchema>;

export const assignRoleSchema = z.object({
  userId: z.string().uuid(),
  roleId: z.string().uuid(),
});
export type AssignRoleInput = z.infer<typeof assignRoleSchema>;

export const removeRoleSchema = z.object({
  userRoleId: z.string().uuid(),
});
export type RemoveRoleInput = z.infer<typeof removeRoleSchema>;
