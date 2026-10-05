import { describe, expect, it } from "vitest";
import { decryptField, encryptField } from "@/server/domain/identity/encryption";

const TEST_KEY = Buffer.alloc(32, 7); // fixed, deterministic 32-byte test key

describe("encryptField / decryptField", () => {
  it("round-trips a plaintext value", () => {
    const encrypted = encryptField("001234567890", TEST_KEY);
    expect(decryptField(encrypted, TEST_KEY)).toBe("001234567890");
  });

  it("never stores the plaintext bytes verbatim in the output", () => {
    const encrypted = encryptField("001234567890", TEST_KEY);
    expect(encrypted.toString("utf8")).not.toContain("001234567890");
  });

  it("produces a different ciphertext each call (random IV)", () => {
    const a = encryptField("001234567890", TEST_KEY);
    const b = encryptField("001234567890", TEST_KEY);
    expect(a.equals(b)).toBe(false);
  });

  it("fails to decrypt with the wrong key (authentication tag mismatch)", () => {
    const encrypted = encryptField("001234567890", TEST_KEY);
    const wrongKey = Buffer.alloc(32, 9);
    expect(() => decryptField(encrypted, wrongKey)).toThrow();
  });

  it("rejects a key that isn't exactly 32 bytes", () => {
    expect(() => encryptField("x", Buffer.alloc(16))).toThrow();
  });
});
