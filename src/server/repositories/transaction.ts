// Deliberately NO "server-only" import: same exception and rationale as wallet-repository.ts and
// payment-repository.ts. Tests run the business rules against a fake database client, and the only dependency
// (`@/server/lib/prisma`) still carries the guard.
import { prisma } from "@/server/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";

/** The handle every repository function receives to take part in one database transaction. */
export type Tx = Prisma.TransactionClient;

/**
 * Runs `work` as one database transaction: everything it writes through `tx` is committed together, or none of
 * it is. Business rules call this instead of touching the database client, so the database is only ever
 * reached through repositories.
 */
export function runInTransaction<T>(
  work: (tx: Tx) => Promise<T>,
  options?: { maxWait?: number; timeout?: number },
): Promise<T> {
  return options ? prisma.$transaction(work, options) : prisma.$transaction(work);
}
