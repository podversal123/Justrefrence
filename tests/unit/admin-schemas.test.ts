import { describe, expect, it } from "vitest";
import { changePasswordSchema, createAdminSchema, updateProfileSchema } from "@/lib/schemas/admin";

describe("createAdminSchema", () => {
  it("accepts a valid payload", () => {
    const result = createAdminSchema.safeParse({
      email: "admin@example.com",
      fullName: "Admin Person",
      roleId: "123e4567-e89b-12d3-a456-426614174000",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a non-uuid roleId", () => {
    const result = createAdminSchema.safeParse({
      email: "admin@example.com",
      fullName: "Admin Person",
      roleId: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });
});

describe("updateProfileSchema", () => {
  it("rejects a single-character name", () => {
    expect(updateProfileSchema.safeParse({ fullName: "A" }).success).toBe(false);
  });
});

describe("changePasswordSchema", () => {
  const base = {
    currentPassword: "OldPassw0rd",
    newPassword: "NewPassw0rd",
    confirmNewPassword: "NewPassw0rd",
  };

  it("accepts a valid password change", () => {
    expect(changePasswordSchema.safeParse(base).success).toBe(true);
  });

  it("rejects mismatched confirmation", () => {
    expect(
      changePasswordSchema.safeParse({ ...base, confirmNewPassword: "Different1" }).success,
    ).toBe(false);
  });

  it("rejects a new password identical to the current one", () => {
    expect(
      changePasswordSchema.safeParse({
        ...base,
        newPassword: base.currentPassword,
        confirmNewPassword: base.currentPassword,
      }).success,
    ).toBe(false);
  });

  it("rejects a weak new password", () => {
    expect(
      changePasswordSchema.safeParse({ ...base, newPassword: "weak", confirmNewPassword: "weak" })
        .success,
    ).toBe(false);
  });
});
