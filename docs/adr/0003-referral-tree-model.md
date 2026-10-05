# ADR-0003: Referral tree stored via Postgres `ltree`, not recursive CTEs

## Status
Accepted

## Context
Referral depth is explicitly unresolved (business-rules.md Q-01 — direct/indirect could mean 2 levels or unlimited), but the commission engine and referral-list UI both need fast ancestor/descendant lookups regardless of how deep the tree ends up being, and the brief explicitly warns against recursive queries on every page load at scale (~10,000 users, per Q-46).

## Decision
Use PostgreSQL's `ltree` extension: `member_profiles.referral_path` stores each member's path as a dot-separated chain of ancestor IDs (own ID appended to the parent's path at referral time). A GiST index on `referral_path` makes "all descendants of X" and "all ancestors of X" single indexed queries instead of a recursive walk. `referral_relationships` remains the authoritative direct-parent-of-record table (audit trail, admin repoint support); `referral_path` is a derived projection maintained by the referral service whenever a relationship is created or (rarely, admin-only) repointed.

## Consequences
- Supports unlimited depth without a schema change, so Q-01's eventual answer doesn't force a migration.
- Ancestor/descendant reads are O(log n) via index, independent of tree depth or request volume.
- Repointing a member (Q-05 — Super Admin only) requires recomputing the `referral_path` for that member's entire subtree; this is an infrequent, admin-gated, already-audited operation, so the cost is acceptable and implemented as an explicit background-safe service call, not a request-time cascade.
- Requires enabling the `ltree` extension on the Supabase Postgres instance (a one-line migration).

## Alternatives considered
- **Recursive CTE over `referral_relationships` at query time** — rejected: re-walks the tree on every page load, exactly what the brief tells us to avoid at scale.
- **Separate closure table** (`ancestor_id, descendant_id, depth`) maintained by triggers — a valid alternative with similar performance characteristics; not chosen because `ltree` gives the same query power with less storage (one column vs. O(n²) worst-case rows) and built-in operators (`<@`, `@>`) instead of hand-rolled join logic. Noted as the fallback if `ltree` proves awkward for any reason during Phase 1 implementation.
