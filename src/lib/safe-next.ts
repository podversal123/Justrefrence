/**
 * Where to send someone after they sign in. Only a path on this site is ever accepted ("/admin/vendors"),
 * never another site, so a crafted login link can't bounce a signed-in person to a look-alike page.
 * Anything else, and the sign-in pages themselves, falls back to the dashboard.
 */
export const DEFAULT_AFTER_LOGIN = "/dashboard";

export function safeNextPath(value: unknown): string {
  if (typeof value !== "string") return DEFAULT_AFTER_LOGIN;
  const path = value.trim();
  if (path.length === 0 || path.length > 300) return DEFAULT_AFTER_LOGIN;
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\"))
    return DEFAULT_AFTER_LOGIN;
  if (/[\u0000-\u001f]/.test(path)) return DEFAULT_AFTER_LOGIN;
  if (/^\/(login|register|forgot-password|reset-password)(\/|\?|$)/.test(path))
    return DEFAULT_AFTER_LOGIN;
  return path;
}
