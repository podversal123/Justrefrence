/**
 * Typed error taxonomy — see docs/error-handling.md.
 * Domain/application services throw these; nothing here builds an HTTP response.
 * The mapping to the API envelope lives in api-response.ts.
 */

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "ACCOUNT_BLOCKED"
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "CONFLICT"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export abstract class AppError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly httpStatus: number;

  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class AuthenticationError extends AppError {
  readonly code = "UNAUTHENTICATED" as const;
  readonly httpStatus = 401;

  constructor(message = "Authentication is required.") {
    super(message);
  }
}

export class AuthorizationError extends AppError {
  readonly code = "FORBIDDEN" as const;
  readonly httpStatus = 403;

  constructor(message = "You do not have access to perform this action.") {
    super(message);
  }
}

export class AccountBlockedError extends AppError {
  readonly code = "ACCOUNT_BLOCKED" as const;
  readonly httpStatus = 403;

  constructor(message = "This account is currently blocked.") {
    super(message);
  }
}

export class ValidationError extends AppError {
  readonly code = "VALIDATION_ERROR" as const;
  readonly httpStatus = 422;

  constructor(message = "The submitted data is invalid.", details?: unknown) {
    super(message, details);
  }
}

export class NotFoundError extends AppError {
  readonly code = "NOT_FOUND" as const;
  readonly httpStatus = 404;

  constructor(message = "The requested resource could not be found.") {
    super(message);
  }
}

export class ConflictError extends AppError {
  readonly code = "CONFLICT" as const;
  readonly httpStatus = 409;

  constructor(message = "This action conflicts with the current state.") {
    super(message);
  }
}

export class RateLimitedError extends AppError {
  readonly code = "RATE_LIMITED" as const;
  readonly httpStatus = 429;

  constructor(message = "Too many requests — please try again shortly.") {
    super(message);
  }
}

export class InternalError extends AppError {
  readonly code = "INTERNAL_ERROR" as const;
  readonly httpStatus = 500;

  constructor(message = "Something went wrong on our end.") {
    super(message);
  }
}
