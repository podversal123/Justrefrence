"use server";

import { revalidatePath } from "next/cache";
import { findUserById } from "@/server/repositories/identity/user-repository";
import {
  countActiveSuperAdmins,
  createRoleGrant,
  createRoleWithPermissions,
  findActiveRoleGrant,
  findPermissionsByCodes,
  findRoleById,
  findRoleGrantWithRole,
  findRoleRowByCode,
  findRoleWithPermissions,
  replaceRolePermissions,
  revokeRoleGrant,
} from "@/server/repositories/role-write-repository";
import { authorize } from "@/server/auth/authorize";
import { recordAudit } from "@/server/domain/audit/record";
import {
  assignRoleSchema,
  createRoleSchema,
  removeRoleSchema,
  updateRolePermissionsSchema,
} from "@/lib/schemas/role";
import type { ApiResult } from "@/lib/api-response";

/**
 * Role management Server Actions — see docs/rbac.md and
 * docs/adr/0010-vendor-profile-and-dynamic-roles.md. Every write here is
 * SUPER_ADMIN-only (role:assign / permission:update) since misconfiguring
 * RBAC has platform-wide blast radius.
 */

function requestId() {
  return crypto.randomUUID();
}

export async function createRoleAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<{ roleId: string }>> {
  let session;
  try {
    session = await authorize("permission:update");
  } catch {
    return {
      success: false,
      error: { code: "FORBIDDEN", message: "You don't have permission to create roles." },
      meta: { requestId: requestId() },
    };
  }

  const permissionCodes = formData.getAll("permissionCodes").map(String);
  const parsed = createRoleSchema.safeParse({
    code: formData.get("code"),
    label: formData.get("label"),
    permissionCodes,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Check the fields below.",
        details: parsed.error.flatten(),
      },
      meta: { requestId: requestId() },
    };
  }

  const existing = await findRoleRowByCode(parsed.data.code);
  if (existing) {
    return {
      success: false,
      error: { code: "CONFLICT", message: "A role with that code already exists." },
      meta: { requestId: requestId() },
    };
  }

  const permissions = await findPermissionsByCodes(parsed.data.permissionCodes);

  const role = await createRoleWithPermissions({
    code: parsed.data.code,
    label: parsed.data.label,
    permissionIds: permissions.map((p) => p.id),
  });

  await recordAudit({
    actorId: session.userId,
    action: "ROLE_CREATED",
    entityType: "roles",
    entityId: role.id,
    after: { code: role.code, label: role.label, permissionCodes: parsed.data.permissionCodes },
  });

  revalidatePath("/admin/roles");

  return { success: true, data: { roleId: role.id }, meta: { requestId: requestId() } };
}

export async function updateRolePermissionsAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("permission:update");
  } catch {
    return {
      success: false,
      error: { code: "FORBIDDEN", message: "You don't have permission to edit role permissions." },
      meta: { requestId: requestId() },
    };
  }

  const permissionCodes = formData.getAll("permissionCodes").map(String);
  const parsed = updateRolePermissionsSchema.safeParse({
    roleId: formData.get("roleId"),
    permissionCodes,
  });

  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid role or permission selection.",
        details: parsed.error.flatten(),
      },
      meta: { requestId: requestId() },
    };
  }

  const role = await findRoleWithPermissions(parsed.data.roleId);

  if (!role) {
    return {
      success: false,
      error: { code: "NOT_FOUND", message: "Role not found." },
      meta: { requestId: requestId() },
    };
  }

  const beforeCodes = role.rolePermissions.map((rp) => rp.permission.code).sort();
  const permissions = await findPermissionsByCodes(parsed.data.permissionCodes);

  await replaceRolePermissions(
    role.id,
    permissions.map((p) => p.id),
  );

  await recordAudit({
    actorId: session.userId,
    action: "ROLE_PERMISSIONS_UPDATED",
    entityType: "roles",
    entityId: role.id,
    before: { permissionCodes: beforeCodes },
    after: { permissionCodes: parsed.data.permissionCodes.sort() },
  });

  revalidatePath("/admin/roles");
  revalidatePath(`/admin/roles/${role.id}`);

  return { success: true, data: null, meta: { requestId: requestId() } };
}

export async function assignRoleAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("role:assign");
  } catch {
    return {
      success: false,
      error: { code: "FORBIDDEN", message: "You don't have permission to assign roles." },
      meta: { requestId: requestId() },
    };
  }

  const parsed = assignRoleSchema.safeParse({
    userId: formData.get("userId"),
    roleId: formData.get("roleId"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid user or role." },
      meta: { requestId: requestId() },
    };
  }

  const [targetUser, role] = await Promise.all([
    findUserById(parsed.data.userId),
    findRoleById(parsed.data.roleId),
  ]);

  if (!targetUser || !role) {
    return {
      success: false,
      error: { code: "NOT_FOUND", message: "User or role not found." },
      meta: { requestId: requestId() },
    };
  }

  const existingActiveGrant = await findActiveRoleGrant(targetUser.id, role.id);

  if (existingActiveGrant) {
    return {
      success: false,
      error: { code: "CONFLICT", message: "This user already holds that role." },
      meta: { requestId: requestId() },
    };
  }

  const grant = await createRoleGrant(targetUser.id, role.id, session.userId);

  await recordAudit({
    actorId: session.userId,
    action: "ROLE_ASSIGNED",
    entityType: "user_roles",
    entityId: grant.id,
    after: { userId: targetUser.id, roleCode: role.code },
  });

  revalidatePath("/admin/admins");
  revalidatePath("/admin/vendors");
  revalidatePath("/admin/roles");

  return { success: true, data: null, meta: { requestId: requestId() } };
}

export async function removeRoleAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("role:assign");
  } catch {
    return {
      success: false,
      error: { code: "FORBIDDEN", message: "You don't have permission to remove roles." },
      meta: { requestId: requestId() },
    };
  }

  const parsed = removeRoleSchema.safeParse({ userRoleId: formData.get("userRoleId") });
  if (!parsed.success) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Invalid role grant." },
      meta: { requestId: requestId() },
    };
  }

  const grant = await findRoleGrantWithRole(parsed.data.userRoleId);

  if (!grant || grant.revokedAt) {
    return {
      success: false,
      error: { code: "NOT_FOUND", message: "That role grant no longer exists." },
      meta: { requestId: requestId() },
    };
  }

  if (grant.role.code === "SUPER_ADMIN") {
    const activeSuperAdmins = await countActiveSuperAdmins();
    if (activeSuperAdmins <= 1) {
      return {
        success: false,
        error: { code: "CONFLICT", message: "Cannot remove the last Super Admin." },
        meta: { requestId: requestId() },
      };
    }
  }

  await revokeRoleGrant(grant.id, session.userId);

  await recordAudit({
    actorId: session.userId,
    action: "ROLE_REMOVED",
    entityType: "user_roles",
    entityId: grant.id,
    before: { userId: grant.userId, roleCode: grant.role.code },
  });

  revalidatePath("/admin/admins");
  revalidatePath("/admin/vendors");
  revalidatePath("/admin/roles");

  return { success: true, data: null, meta: { requestId: requestId() } };
}
