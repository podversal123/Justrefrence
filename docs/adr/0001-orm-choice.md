# ADR-0001: ORM — Prisma over Drizzle

## Status
Accepted

## Context
The brief explicitly asks us to choose one of Prisma or Drizzle and document why. Both work fine over Supabase Postgres; the choice matters mainly for migration workflow, maintainability by a future senior developer unfamiliar with this codebase, and how well the tool supports the money-critical discipline this project requires (insert-only ledger tables, transactions, raw `ltree` queries for the referral tree).

## Decision
Use **Prisma** as the ORM/migration tool for the whole application.

Reasons:
- **Migration tooling maturity.** `prisma migrate` gives a reviewable, linear migration history with a shadow-database diff step, which matters directly for the requirement that financial-table migrations get a second reviewer (see [deployment.md](../deployment.md) §3) — the generated SQL is easy to read in a PR diff.
- **Maintainability by another senior developer.** Prisma's schema DSL, generated client, and documentation are more widely known; the brief explicitly optimizes for "easy for another senior developer to maintain," and Prisma has a larger hiring pool of familiarity than Drizzle today.
- **Prisma Studio** gives the team (and support/finance staff debugging a specific ledger row, under proper access control) a safe, read-focused way to inspect data during development without hand-writing SQL.
- **Transactions.** `prisma.$transaction([...])` and interactive transactions map cleanly onto the "every financial operation is transactional" requirement, with a clear boundary that maps 1:1 to the application-service layer described in [architecture.md](../architecture.md).
- **Known trade-off accepted:** Drizzle is lighter-weight, has less runtime overhead, and its SQL-like query builder is arguably a better fit for the hand-tuned `ltree` referral queries. We accept writing those specific few queries as reviewed raw SQL via `$queryRaw` (documented inline per [security.md](../security.md) §4) rather than switching the whole ORM for one subsystem's needs.

## Consequences
- `prisma/schema.prisma` is the single source of schema truth; [database.md](../database.md) is kept in sync with it but the generated schema is authoritative once Phase 1 starts.
- A small number of raw, parameterized SQL queries are allowed for `ltree` operations and are the only sanctioned exception to "Prisma query builder only."

## Alternatives considered
- **Drizzle ORM** — lighter, closer to SQL, good TypeScript inference; rejected primarily on migration-review ergonomics and team/hiring familiarity, not capability.
