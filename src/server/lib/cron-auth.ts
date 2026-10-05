import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Constant-time check of the `Authorization: Bearer <CRON_SECRET>` header
 * every scheduled-job route uses (docs/environment.md). Both sides are
 * hashed first so the comparison is fixed-length regardless of what the
 * caller sends. Fails closed when CRON_SECRET is unset.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env["CRON_SECRET"];
  if (!secret) return false;

  const provided = request.headers.get("authorization") ?? "";
  const digest = (value: string) => createHash("sha256").update(value).digest();
  return timingSafeEqual(digest(provided), digest(`Bearer ${secret}`));
}
