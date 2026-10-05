import { describe, expect, it } from "vitest";
import {
  epinCodeLast4,
  generateEpinCode,
  hashEpinCode,
  maskEpinCode,
  verifyEpinCode,
} from "@/server/domain/epin/epin-code";

const KEY = Buffer.alloc(32, 7);

describe("generateEpinCode", () => {
  it("generates a 16-character code from the unambiguous alphabet", () => {
    const code = generateEpinCode();
    expect(code).toHaveLength(16);
    expect(code).toMatch(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{16}$/);
  });

  it("generates different codes across calls", () => {
    const codes = new Set(Array.from({ length: 20 }, () => generateEpinCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe("hashEpinCode / verifyEpinCode", () => {
  it("is deterministic for the same code and key (enables direct lookup)", () => {
    const code = generateEpinCode();
    expect(hashEpinCode(code, KEY)).toBe(hashEpinCode(code, KEY));
  });

  it("verifies a matching code", () => {
    const code = generateEpinCode();
    const hash = hashEpinCode(code, KEY);
    expect(verifyEpinCode(code, KEY, hash)).toBe(true);
  });

  it("rejects a non-matching code", () => {
    const hash = hashEpinCode("AAAAAAAAAAAAAAAA", KEY);
    expect(verifyEpinCode("BBBBBBBBBBBBBBBB", KEY, hash)).toBe(false);
  });

  it("produces a different hash for a different key (key-dependent, not guessable without it)", () => {
    const code = "AAAAAAAAAAAAAAAA";
    const otherKey = Buffer.alloc(32, 9);
    expect(hashEpinCode(code, KEY)).not.toBe(hashEpinCode(code, otherKey));
  });

  it("never leaks the raw code in the hash output", () => {
    const code = generateEpinCode();
    expect(hashEpinCode(code, KEY)).not.toContain(code);
  });
});

describe("epinCodeLast4 / maskEpinCode", () => {
  it("extracts the last 4 characters", () => {
    expect(epinCodeLast4("ABCD1234EFGH5678")).toBe("5678");
  });

  it("masks everything but the last 4", () => {
    expect(maskEpinCode("ABCD1234EFGH5678")).toBe("************5678");
  });
});
