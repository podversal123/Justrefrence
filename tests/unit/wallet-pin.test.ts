import { describe, expect, it } from "vitest";
import { hashWalletPin, isValidPinFormat, verifyWalletPin } from "@/server/domain/wallet/wallet-pin";

describe("hashWalletPin / verifyWalletPin", () => {
  it("round-trips a correct PIN", () => {
    const hash = hashWalletPin("123456");
    expect(verifyWalletPin("123456", hash)).toBe(true);
  });

  it("rejects an incorrect PIN", () => {
    const hash = hashWalletPin("123456");
    expect(verifyWalletPin("654321", hash)).toBe(false);
  });

  it("produces a different hash each time (random salt)", () => {
    expect(hashWalletPin("123456")).not.toBe(hashWalletPin("123456"));
  });

  it("never stores the raw PIN in the hash output", () => {
    const hash = hashWalletPin("123456");
    expect(hash).not.toContain("123456");
  });

  it("rejects a malformed stored value gracefully", () => {
    expect(verifyWalletPin("123456", "not-a-valid-hash")).toBe(false);
  });
});

describe("isValidPinFormat", () => {
  it("accepts a 6-digit PIN", () => {
    expect(isValidPinFormat("123456")).toBe(true);
  });

  it("rejects non-6-digit input", () => {
    expect(isValidPinFormat("12345")).toBe(false);
    expect(isValidPinFormat("1234567")).toBe(false);
    expect(isValidPinFormat("12345a")).toBe(false);
  });
});
