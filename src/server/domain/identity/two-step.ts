/**
 * Two-step login (an authenticator app giving a 6-digit code) for staff accounts. The pure rules,
 * with no I/O, so they can be tested directly. The actual enrolling and checking is done by
 * Supabase Auth's TOTP factors in src/server/services/two-step-actions.ts.
 */

/** What an authenticator app shows: exactly six digits. Spaces and dashes people type are ignored. */
export function parseTwoStepCode(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const digits = input.replace(/[\s-]/g, "");
  return /^\d{6}$/.test(digits) ? digits : null;
}

/**
 * Whether a signed-in account still has to finish two-step before it may do anything. Only staff
 * accounts are held to it, and only while the Super Admin has the requirement switched on. A session
 * whose level is unknown counts as not finished, so a failed lookup never lets anyone through.
 */
export function isTwoStepPending(input: {
  required: boolean;
  isStaff: boolean;
  level: string | null | undefined;
}): boolean {
  return input.required && input.isStaff && input.level !== "aal2";
}

/** The Supabase QR code is an SVG string; this makes it usable as an image address. */
export function qrImageSrc(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
