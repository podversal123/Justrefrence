/**
 * The standard API envelope — see docs/api.md §2-3.
 * Every Route Handler returns this shape; Server Actions return the same
 * shape as a plain object (not a raw NextResponse).
 */

import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { randomUUID } from "node:crypto";
import { AppError, InternalError, ValidationError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";

export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta: { requestId: string };
}

export interface ApiFailure {
  success: false;
  error: { code: string; message: string; details?: unknown };
  meta: { requestId: string };
}

export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export function apiSuccess<T>(data: T, requestId: string = randomUUID()): ApiSuccess<T> {
  return { success: true, data, meta: { requestId } };
}

export function apiFailure(
  code: string,
  message: string,
  details?: unknown,
  requestId: string = randomUUID(),
): ApiFailure {
  return { success: false, error: { code, message, details }, meta: { requestId } };
}

/**
 * Maps any thrown error to the envelope + correct HTTP status. This is the
 * ONLY place error-to-HTTP translation happens (see docs/error-handling.md §2).
 * Route Handlers call this from a catch block; nothing above it re-implements
 * the mapping.
 */
export function toApiErrorResponse(error: unknown): NextResponse<ApiFailure> {
  const requestId = randomUUID();

  if (error instanceof ZodError) {
    const mapped = new ValidationError("The submitted data is invalid.", error.flatten());
    logger.warn("validation_error", { requestId, issues: error.issues });
    return NextResponse.json(apiFailure(mapped.code, mapped.message, mapped.details, requestId), {
      status: mapped.httpStatus,
    });
  }

  if (error instanceof AppError) {
    if (error.httpStatus >= 500) {
      logger.error(error.message, { requestId, code: error.code, stack: error.stack });
    } else {
      logger.warn(error.message, { requestId, code: error.code });
    }
    return NextResponse.json(apiFailure(error.code, error.message, error.details, requestId), {
      status: error.httpStatus,
    });
  }

  // Unexpected error — full detail server-side only, generic message to the client.
  logger.error("unhandled_error", {
    requestId,
    message: error instanceof Error ? error.message : String(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  const fallback = new InternalError();
  return NextResponse.json(apiFailure(fallback.code, fallback.message, undefined, requestId), {
    status: fallback.httpStatus,
  });
}

export function jsonSuccess<T>(data: T, init?: number): NextResponse<ApiSuccess<T>> {
  return NextResponse.json(apiSuccess(data), { status: init ?? 200 });
}
