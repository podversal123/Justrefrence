/**
 * E-pin code generation, hashing, and masking — pure, no I/O, no env
 * access (the HMAC key is passed in by the caller; the env-reading wrapper
 * is src/server/lib/field-encryption.ts's getFieldEncryptionKey(), reused
 * here — see docs/adr/0015-wallet-epin-subscription.md). The raw code is
 * never logged anywhere this module is used; only codeLast4 ever is.
 */
import { createHmac } from "node:crypto";

const CODE_LENGTH = 16;
// Excludes 0/O/1/I and other easily-confused characters.
const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateEpinCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join("");
}

/** Deterministic (same code + key -> same hash) — enables direct lookup-by-code at redemption. */
export function hashEpinCode(code: string, key: Buffer): string {
  return createHmac("sha256", key).update(code).digest("hex");
}

export function verifyEpinCode(code: string, key: Buffer, storedHash: string): boolean {
  return hashEpinCode(code, key) === storedHash;
}

export function epinCodeLast4(code: string): string {
  return code.slice(-4);
}

/** Display-only masking, e.g. for a resend/confirmation screen that already has the full code in hand. */
export function maskEpinCode(code: string): string {
  return `${"*".repeat(Math.max(code.length - 4, 0))}${code.slice(-4)}`;
}
