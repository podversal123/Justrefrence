import { describe, expect, it } from "vitest";
import { createRoleSchema, updateRolePermissionsSchema } from "@/lib/schemas/role";

describe("createRoleSchema", () => {
  it("accepts a valid UPPER_SNAKE_CASE code", () => {
    const result = createRoleSchema.safeParse({
      code: "CATALOG_MANAGER",
      label: "Catalog Manager",
      permissionCodes: ["product:read", "product:update"],
    });
    expect(result.success).toBe(true);
  });

  it("upper-cases a lowercase code", () => {
    const result = createRoleSchema.parse({
      code: "catalog_manager",
      label: "Catalog Manager",
      permissionCodes: [],
    });
    expect(result.code).toBe("CATALOG_MANAGER");
  });

  it("rejects a code with spaces or punctuation", () => {
    expect(
      createRoleSchema.safeParse({ code: "Catalog Manager!", label: "x", permissionCodes: [] })
        .success,
    ).toBe(false);
  });

  it("rejects an unknown permission code", () => {
    const result = createRoleSchema.safeParse({
      code: "TEST_ROLE",
      label: "Test Role",
      permissionCodes: ["not:a:real:permission"],
    });
    expect(result.success).toBe(false);
  });

  it("defaults to an empty permission set", () => {
    const result = createRoleSchema.parse({ code: "EMPTY_ROLE", label: "Empty Role" });
    expect(result.permissionCodes).toEqual([]);
  });
});

describe("updateRolePermissionsSchema", () => {
  it("requires a valid role id", () => {
    const result = updateRolePermissionsSchema.safeParse({
      roleId: "not-a-uuid",
      permissionCodes: [],
    });
    expect(result.success).toBe(false);
  });
});
