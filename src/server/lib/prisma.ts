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
    max: 10,
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
