# ADR-0002: Money stored as integer paise, ledger-first

## Status
Accepted

## Context
The platform moves real money across orders, commissions, wallets, payouts, and TDS. Floating-point and even naive `numeric`/`decimal` "current balance" columns updated in place are a well-known source of rounding drift and lost-update bugs, and neither gives a natural audit trail.

## Decision
- Every monetary value is stored as a `bigint` count of paise (smallest INR unit), never `float`/`double`, and never a bare `numeric` used for arithmetic in application code.
- Every table that represents a balance-affecting event (`wallet_transactions`, `commission_ledger`, `payout_transactions`, `tds_transactions`, `reward_transactions`) is **insert-only**: the application DB role has no `UPDATE`/`DELETE` grant on these tables. Corrections are new, offsetting rows.
- Any "current balance" field (e.g. `wallets.balance`) is a cached projection, written only inside the same transaction as the ledger row that justifies it, and is periodically reconciled by re-summing the ledger.

## Consequences
- All money math (commission %, GST, TDS, discounts) happens in integer arithmetic with explicit, tested rounding rules (round-half-up on the final paise, applied once, server-side).
- Reporting/export code always has a replayable source of truth (the ledger) independent of the cached balance, which materially simplifies the reconciliation job and audit responses.
- Slightly more verbose display-layer code (convert paise → ₹ formatting at the UI boundary only) — an accepted, small cost.

## Alternatives considered
- `numeric(12,2)` balance columns updated in place — rejected: no natural audit trail, update-in-place invites lost-update races under concurrency, still requires careful rounding discipline anyway so it buys nothing over integer paise.
- Event-sourcing the entire domain — rejected as over-engineering for Phase 1; the ledger-per-subsystem pattern gets the auditability benefit without a full event-sourced architecture.
