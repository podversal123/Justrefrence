import "server-only";

/**
 * Reads and validates FIELD_ENCRYPTION_KEY (see .env.example) — the
 * server-only I/O boundary around the pure encrypt/decrypt logic in
 * src/server/domain/identity/encryption.ts. Expects a base64-encoded
 * 32-byte (AES-256) key.
 */
export function getFieldEncryptionKey(): Buffer {
  const raw = process.env["FIELD_ENCRYPTION_KEY"];
  if (!raw) {
    throw new Error(
      "FIELD_ENCRYPTION_KEY is not set — required to store bank account details. See .env.example.",
    );
  }
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error(
      "FIELD_ENCRYPTION_KEY must decode to exactly 32 bytes (base64-encoded AES-256 key).",
    );
  }
  return key;
}
