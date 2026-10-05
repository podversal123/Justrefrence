# ADR-0008: Explicit state-machine functions for order/project/bid status, no direct status writes

## Status
Accepted

## Context
The brief requires that order statuses not allow arbitrary transitions and calls for "a state machine or controlled transition service." The same need applies to project workflow status and bid status, which have their own status sets and approval gates (project needs Admin approval; a bid, once accepted, closes the requirement).

## Decision
Each of `orders`, `projects`, and `bidding_requirements`/`bids` gets a dedicated `transition(current, event, actor, context) → nextStatus | throws InvalidTransitionError` function in its domain module (`src/server/domain/{orders,catalog,bidding}/state-machine.ts`). No repository or service is permitted to write a status column directly with a plain `UPDATE ... SET status = ...` outside that function; the transition function is the only code path that produces a new status value, and every transition also writes an `order_status_history` (or equivalent) row for auditability and the order-tracking UI.

Each transition function additionally checks *who* (which role/permission) may trigger which specific transition, per [rbac.md](../rbac.md) — e.g. a vendor may move `PROCESSING → SHIPPED`, but only a customer or admin may move to `CANCELLED` from an early state, and only `COMPLETED` triggers commission release eligibility (Q-06).

## Consequences
- Illegal transitions (`DELIVERED → PLACED`, accepting a second bid on an already-`AWARDED` requirement) are structurally impossible, not just discouraged by convention.
- The transition function is trivially unit-testable in isolation (pure function, no DB), satisfying the brief's emphasis on testing state-machine-like business logic directly.
- Status enums are defined once per domain module and reused by the Prisma `CHECK` constraint generation, the transition function, and the UI badge component — no duplicated status list to drift out of sync.

## Alternatives considered
- **A generic, config-driven workflow engine** — rejected as over-engineering for three known, bounded state machines; revisit only if a fourth or fifth genuinely novel workflow emerges later (Phase 2+).
