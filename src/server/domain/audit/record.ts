import "server-only";
import { prisma } from "@/server/lib/prisma";
import { logger } from "@/server/lib/logger";

/**
 * The single write path into audit_logs — see docs/audit-logging.md §1.
 * INSERT-only; nothing in this codebase ever updates or deletes an
 * audit_logs row. Redaction happens here, once, rather than trusting every
 * call site.
 */

const SENSITIVE_KEY_PATTERN =
  /password|otp|pin|secret|token|api[-_]?key|authorization|account_no|aadhaar/i;

function redactSnapshot(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map(redactSnapshot);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key) ? "[REDACTED]" : redactSnapshot(val);
    }
    return out;
  }
  return value;
}

export interface AuditEntry {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  ip?: string | null;
  userAgent?: string | null;
}

export async function recordAudit(entry: AuditEntry): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorId: entry.actorId,
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId,
        beforeJson: entry.before ? (redactSnapshot(entry.before) as object) : undefined,
        afterJson: entry.after ? (redactSnapshot(entry.after) as object) : undefined,
        ip: entry.ip ?? undefined,
        userAgent: entry.userAgent ?? undefined,
      },
    });
  } catch (error) {
    // An audit-write failure must never take down the business operation it
    // is recording, but it must not be silent either — this is the one
    // sanctioned "log and continue" in the whole codebase, precisely because
    // the thing that failed IS the logging mechanism.
    logger.error("audit_write_failed", {
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
