/**
 * Structured, redacting logger — see docs/security.md §8 (logging discipline).
 *
 * Never logged, anywhere: passwords, OTP codes, wallet PINs, raw e-pins, API
 * keys/secrets, full session tokens. This module enforces that with an
 * allowlist-denial redaction pass rather than trusting each call site.
 */

type LogLevel = "debug" | "info" | "warn" | "error";

const REDACTED = "[REDACTED]";

const SENSITIVE_KEY_PATTERN =
  /password|otp|pin|secret|token|api[-_]?key|authorization|credit[-_]?card|cvv/i;

function redact(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[TRUNCATED]";
  if (value === null || value === undefined) return value;

  if (Array.isArray(value)) {
    return value.map((item) => redact(item, depth + 1));
  }

  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : redact(val, depth + 1);
    }
    return out;
  }

  return value;
}

interface LogContext {
  requestId?: string;
  userId?: string;
  [key: string]: unknown;
}

function write(level: LogLevel, message: string, context?: LogContext) {
  const entry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(context ? (redact(context) as Record<string, unknown>) : {}),
  };

  const line = JSON.stringify(entry);

  // This is the one sanctioned console sink in the codebase (see api-response.ts / errors.ts).
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (message: string, context?: LogContext) => write("debug", message, context),
  info: (message: string, context?: LogContext) => write("info", message, context),
  warn: (message: string, context?: LogContext) => write("warn", message, context),
  error: (message: string, context?: LogContext) => write("error", message, context),
};
