import { describe, expect, it } from "vitest";
import { adminCreateMemberSchema, adminUpdateMemberSchema } from "@/lib/schemas/member";
import { passwordRules } from "@/lib/schemas/auth";
import { generateTemporaryPassword } from "@/server/lib/temporary-password";

describe("adminCreateMemberSchema", () => {
  it("accepts the basics and lowercases the email", () => {
    const r = adminCreateMemberSchema.safeParse({
      fullName: "Asha Rao",
      email: "  ASHA@Example.com ",
    });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.email).toBe("asha@example.com");
  });

  it("treats empty optional fields as absent", () => {
    const r = adminCreateMemberSchema.safeParse({
      fullName: "Asha Rao",
      email: "asha@example.com",
      phone: "",
      referralCode: "",
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.phone).toBeUndefined();
      expect(r.data.referralCode).toBeUndefined();
    }
  });

  it("accepts a 10-digit Referral ID and validates the mobile number", () => {
    const ok = adminCreateMemberSchema.safeParse({
      fullName: "Asha Rao",
      email: "asha@example.com",
      phone: "+919876543210",
      referralCode: " 4205551234 ",
    });
    expect(ok.success && ok.data.referralCode).toBe("4205551234");
    expect(
      adminCreateMemberSchema.safeParse({
        fullName: "Asha Rao",
        email: "asha@example.com",
        referralCode: "JR-000001",
      }).success,
    ).toBe(false);
    expect(
      adminCreateMemberSchema.safeParse({ fullName: "Asha Rao", email: "a@b.co", phone: "12345" })
        .success,
    ).toBe(false);
  });

  it("rejects a bad email or a too-short name", () => {
    expect(adminCreateMemberSchema.safeParse({ fullName: "A", email: "a@b.co" }).success).toBe(
      false,
    );
    expect(
      adminCreateMemberSchema.safeParse({ fullName: "Asha Rao", email: "not-an-email" }).success,
    ).toBe(false);
  });
});

describe("adminUpdateMemberSchema", () => {
  const base = { userId: "5b1c0a62-0a52-4b4a-9f0c-0e9a7b8f1d11", fullName: "Asha Rao" };

  it("requires a uuid user id", () => {
    expect(adminUpdateMemberSchema.safeParse({ ...base, userId: "nope" }).success).toBe(false);
    expect(adminUpdateMemberSchema.safeParse(base).success).toBe(true);
  });

  it("applies the same PAN and GSTIN rules members face themselves", () => {
    expect(adminUpdateMemberSchema.safeParse({ ...base, pan: "abcde1234f" }).success).toBe(true);
    expect(adminUpdateMemberSchema.safeParse({ ...base, pan: "BAD" }).success).toBe(false);
    expect(adminUpdateMemberSchema.safeParse({ ...base, gstin: "123" }).success).toBe(false);
  });
});

describe("generateTemporaryPassword", () => {
  it("always satisfies the password rules and avoids look-alike characters", () => {
    for (let i = 0; i < 200; i++) {
      const pw = generateTemporaryPassword();
      expect(passwordRules.safeParse(pw).success).toBe(true);
      expect(pw).not.toMatch(/[0OIl1]/);
    }
  });

  it("is not the same twice in a row", () => {
    expect(generateTemporaryPassword()).not.toBe(generateTemporaryPassword());
  });
});
