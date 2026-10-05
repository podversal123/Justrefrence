import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import type { ZodError } from "zod";
import { AppError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import type { ApiFailure } from "@/lib/api-response";

/**
 * Shared plumbing for Server Actions, so each action file does not
 * re-implement the same envelope helpers (the older action files each carry
 * a private copy; new modules use this).
 */

export function requestId(): string {
  return randomUUID();
}

/** AppError → its own code/message (safe to show); anything else → logged, generic message. */
export function failureFrom(
  logTag: string,
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): ApiFailure {
  if (error instanceof AppError) {
    return {
      success: false,
      error: { code: error.code, message: error.message, details: error.details },
      meta: { requestId: requestId() },
    };
  }
  logger.error(logTag, { message: error instanceof Error ? error.message : String(error) });
  return {
    success: false,
    error: { code: "INTERNAL_ERROR", message: fallback },
    meta: { requestId: requestId() },
  };
}

export function validationFailure(message: string, error: ZodError): ApiFailure {
  return {
    success: false,
    error: { code: "VALIDATION_ERROR", message, details: error.flatten() },
    meta: { requestId: requestId() },
  };
}

/** Best-effort client IP for rate-limit keys (first X-Forwarded-For hop). */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
