/**
 * AES-256-GCM envelope encryption for the one column that needs it at rest
 * (bank account number — see docs/security.md §6-7). Deliberately takes the
 * key as a parameter rather than reading `FIELD_ENCRYPTION_KEY` itself, so
 * this stays pure/unit-testable (tests/unit/encryption.test.ts) with a fixed
 * test key; the env-reading, server-only wrapper is
 * src/server/lib/field-encryption.ts.
 *
 * Output layout: `iv (12 bytes) | authTag (16 bytes) | ciphertext`, one
 * Buffer, matching the schema's `account_no_encrypted bytea` column.
 */
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

export function encryptField(plaintext: string, key: Buffer): Buffer {
  if (key.length !== 32) {
    throw new Error("Field encryption key must be exactly 32 bytes.");
  }
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]);
}

export function decryptField(payload: Buffer, key: Buffer): string {
  if (key.length !== 32) {
    throw new Error("Field encryption key must be exactly 32 bytes.");
  }
  const iv = payload.subarray(0, IV_LENGTH);
  const authTag = payload.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const ciphertext = payload.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
