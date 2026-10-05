/**
 * Wallet PIN hashing — per-wallet-salted `scrypt`, the same class of
 * defense a login password gets (Q-13, security.md: "stored... exactly
 * like passwords"). No I/O, no env access — pure, unit-tested directly.
 * See docs/adr/0015-wallet-epin-subscription.md for why this differs from
 * e-pin code hashing (which needs a direct-lookup-by-code property this
 * does not).
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SALT_BYTES = 16;
const KEY_LENGTH = 64;

export function hashWalletPin(pin: string): string {
  const salt = randomBytes(SALT_BYTES);
  const derived = scryptSync(pin, salt, KEY_LENGTH);
  return `${salt.toString("hex")}:${derived.toString("hex")}`;
}

export function verifyWalletPin(pin: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(":");
  if (!saltHex || !hashHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const candidate = scryptSync(pin, salt, expected.length);

  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

export function isValidPinFormat(pin: string): boolean {
  return /^\d{6}$/.test(pin);
}
