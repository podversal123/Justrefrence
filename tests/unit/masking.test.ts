import { describe, expect, it } from "vitest";
import {
  maskBankAccountNumber,
  maskDestination,
  maskEmail,
  maskPan,
  maskPhone,
} from "@/server/domain/identity/masking";

describe("maskEmail", () => {
  it("keeps the first local-part character and the full domain", () => {
    const masked = maskEmail("shiva@example.com");
    expect(masked.startsWith("s")).toBe(true);
    expect(masked.endsWith("@example.com")).toBe(true);
    expect(masked).not.toContain("shiva");
  });
});

describe("maskPhone", () => {
  it("keeps only the last 4 digits", () => {
    expect(maskPhone("+919876543210")).toBe("********3210");
  });
});

describe("maskPan", () => {
  it("matches the security.md example: ABCDE****F", () => {
    expect(maskPan("ABCDE1234F")).toBe("ABCDE****F");
  });
});

describe("maskBankAccountNumber", () => {
  it("matches the security.md example: ******1234", () => {
    expect(maskBankAccountNumber("001234567890")).toBe("********7890");
  });
});

describe("maskDestination", () => {
  it("routes EMAIL through maskEmail and SMS/WHATSAPP through maskPhone", () => {
    expect(maskDestination("a@b.com", "EMAIL")).toBe(maskEmail("a@b.com"));
    expect(maskDestination("9876543210", "SMS")).toBe(maskPhone("9876543210"));
    expect(maskDestination("9876543210", "WHATSAPP")).toBe(maskPhone("9876543210"));
  });
});
