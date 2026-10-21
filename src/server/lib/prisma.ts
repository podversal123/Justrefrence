import "server-only";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/**
 * Prisma 7 requires an explicit driver adapter for SQL providers — see
 * docs/adr/0001-orm-choice.md. Singleton pattern prevents exhausting the
 * connection pool across Next.js hot-reloads in development.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

/**
 * Connections each server instance may hold. Every serverless instance has its own pool, so the
 * database sees (instances x this number): on Vercel keep it small, and use the database's
 * transaction pooler (Supabase port 6543) so those few connections are shared instead of each
 * holding a database connection for the whole session. Override with DB_POOL_MAX.
 */
function poolSize(): number {
  const fromEnv = Number.parseInt(process.env["DB_POOL_MAX"] ?? "", 10);
  if (Number.isInteger(fromEnv) && fromEnv > 0) return fromEnv;
  return process.env["VERCEL"] ? 5 : 10;
}

function createPrismaClient() {
  const connectionString = process.env["DATABASE_URL"];

  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Copy .env.example to .env.local (and .env for the Prisma CLI) and fill in a real Supabase Postgres connection string before running anything that touches the database.",
    );
  }

  const adapter = new PrismaPg({
    connectionString,
    // A cold page (homepage = header + ~8 section queries in parallel)
    // opens several TLS connections to a remote pooler at once; 5s was too
    // tight and surfaced as "Connection terminated due to connection
    // timeout" sections. Bounded pool + generous connect timeout + TCP
    // keepalive so idle pooler-dropped sockets are noticed.
    max: poolSize(),
    connectionTimeoutMillis: 20_000,
    idleTimeoutMillis: 30_000,
    keepAlive: true,
  });

  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
