import { describe, expect, it } from "vitest";
import {
  addressSchema,
  bankAccountSchema,
  memberDetailsSchema,
  mobileLoginRequestSchema,
  registerSchema,
  verifyRegistrationSchema,
} from "@/lib/schemas/member";

const validRegister = {
  fullName: "Jane Doe",
  email: "jane@example.com",
  phone: "+919876543210",
  password: "Password1234",
  confirmPassword: "Password1234",
  channel: "EMAIL" as const,
};

describe("registerSchema", () => {
  it("accepts a valid direct registration", () => {
    expect(registerSchema.safeParse(validRegister).success).toBe(true);
  });

  it("rejects mismatched passwords", () => {
    const result = registerSchema.safeParse({ ...validRegister, confirmPassword: "Other12345" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid phone number", () => {
    const result = registerSchema.safeParse({ ...validRegister, phone: "12345" });
    expect(result.success).toBe(false);
  });

  it("uppercases and trims an optional referral code", () => {
    const result = registerSchema.safeParse({ ...validRegister, referralCode: " jr-000042 " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.referralCode).toBe("JR-000042");
  });

  it("leaves referralCode undefined when omitted", () => {
    const result = registerSchema.safeParse(validRegister);
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.referralCode).toBeUndefined();
  });
});

describe("verifyRegistrationSchema", () => {
  it("requires a 6-digit code", () => {
    expect(
      verifyRegistrationSchema.safeParse({
        userId: "11111111-1111-4111-8111-111111111111",
        code: "12a456",
      }).success,
    ).toBe(false);
    expect(
      verifyRegistrationSchema.safeParse({
        userId: "11111111-1111-4111-8111-111111111111",
        code: "123456",
      }).success,
    ).toBe(true);
  });
});

describe("mobileLoginRequestSchema", () => {
  it("accepts a valid mobile number", () => {
    expect(mobileLoginRequestSchema.safeParse({ phone: "+919876543210" }).success).toBe(true);
  });
});

describe("memberDetailsSchema", () => {
  it("accepts a valid PAN and rejects a malformed one", () => {
    expect(
      memberDetailsSchema.safeParse({ fullName: "Jane Doe", pan: "ABCDE1234F" }).success,
    ).toBe(true);
    expect(
      memberDetailsSchema.safeParse({ fullName: "Jane Doe", pan: "NOTAPAN" }).success,
    ).toBe(false);
  });

  it("accepts a valid GSTIN and rejects a malformed one", () => {
    expect(
      memberDetailsSchema.safeParse({ fullName: "Jane Doe", gstin: "29ABCDE1234F1Z5" }).success,
    ).toBe(true);
    expect(
      memberDetailsSchema.safeParse({ fullName: "Jane Doe", gstin: "invalid" }).success,
    ).toBe(false);
  });

  it("treats blank optional fields as absent rather than invalid", () => {
    const result = memberDetailsSchema.safeParse({ fullName: "Jane Doe", pan: "", gstin: "" });
    expect(result.success).toBe(true);
  });
});

describe("addressSchema", () => {
  it("requires a valid 6-digit postal code", () => {
    expect(
      addressSchema.safeParse({
        type: "RESIDENCE",
        line1: "123 Main St",
        city: "Mumbai",
        state: "MH",
        postalCode: "12345",
        country: "IN",
      }).success,
    ).toBe(false);

    expect(
      addressSchema.safeParse({
        type: "RESIDENCE",
        line1: "123 Main St",
        city: "Mumbai",
        state: "MH",
        postalCode: "400001",
        country: "IN",
      }).success,
    ).toBe(true);
  });
});

describe("bankAccountSchema", () => {
  it("validates the IFSC format", () => {
    expect(
      bankAccountSchema.safeParse({
        accountHolderName: "Jane Doe",
        accountNumber: "001234567890",
        ifsc: "HDFC0001234",
      }).success,
    ).toBe(true);

    expect(
      bankAccountSchema.safeParse({
        accountHolderName: "Jane Doe",
        accountNumber: "001234567890",
        ifsc: "NOTVALID",
      }).success,
    ).toBe(false);
  });
});
