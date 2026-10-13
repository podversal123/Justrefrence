import { randomInt } from "node:crypto";

const UPPER = "ABCDEFGHJKMNPQRSTUVWXYZ";
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const DIGITS = "23456789";
const pick = (set: string) => set[randomInt(set.length)]!;

/**
 * A temporary password that satisfies passwordRules (10+ chars, upper, lower, digit),
 * easy to read out loud (no 0/O/1/l/I). Shown to the admin once, never stored.
 */
export function generateTemporaryPassword(): string {
  const chars = [
    pick(UPPER),
    pick(UPPER),
    pick(LOWER),
    pick(LOWER),
    pick(LOWER),
    pick(LOWER),
    pick(DIGITS),
    pick(DIGITS),
    pick(DIGITS),
    pick(LOWER),
    pick(UPPER),
    pick(DIGITS),
  ];
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j]!, chars[i]!];
  }
  return chars.join("");
}
