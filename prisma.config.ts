import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma CLI reads DATABASE_URL / DIRECT_URL from .env (this file's `dotenv/config`
// import). The Next.js app itself reads its runtime env vars from .env.local.
// Both are gitignored; see docs/environment.md and .env.example for the full list.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});
