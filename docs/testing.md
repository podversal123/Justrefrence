# Just Reference — Testing Strategy (Phase 0)

## 1. Layers

| Layer | Tool | Scope |
|---|---|---|
| Unit | Vitest | Pure domain logic: commission calculation, wallet invariants, state-machine transitions, tax computation, Zod schemas — no DB, no HTTP |
| Integration | Vitest + a real test Postgres (Supabase local/Docker) | Repository queries, service-layer transactions (e.g., "placing an order creates the right order/invoice/commission rows atomically"), Route Handlers via direct function invocation |
| API/contract | Postman collection (`postman/`) run via `newman` in CI | Every Route Handler in [api.md](api.md) §5, including auth/permission-denied cases |
| End-to-end | Playwright | Full user journeys through the actual UI: signup→referral→order→payment→commission→wallet→payout, across CUSTOMER/VENDOR/ADMIN/FINANCE/SUPER_ADMIN roles |

Every important business module listed in the brief has at least unit + integration coverage before it's considered done: AUTH, RBAC, PRODUCTS, CART, CHECKOUT, PAYMENT, ORDER, REFERRAL, COMMISSION, WALLET, PAYOUT, EPIN, SUBSCRIPTION, COUPON, REWARD, TDS, INVOICE, SUPPORT, MESSAGING.

## 2. Required financial edge cases (explicit test list, not left to chance)

- Duplicate Razorpay webhook delivery for the same payment → only one `payment_events`/wallet-credit side effect.
- Double payout: two concurrent payout-approval requests against the same wallet → only one succeeds, the other gets `CONFLICT`/`INSUFFICIENT_BALANCE`.
- Refund after commission already withdrawn → commission reversed, wallet does not go negative, shortfall recorded against future earnings (Q-07).
- Concurrent wallet withdrawals (two simultaneous payout requests exceeding balance combined but not individually) → row-locking prevents both succeeding.
- Expired e-pin redemption attempt → rejected with a specific error code, no subscription created.
- Reused (already-redeemed) e-pin → rejected, `epin_redemptions` unique constraint holds.
- Invalid/expired/over-limit coupon at checkout → rejected with a specific error, no discount applied.
- Unauthorized admin action (e.g., `SUPPORT` attempting `payout:approve`) → `FORBIDDEN`, action not performed, attempt logged.
- Vendor A attempting to read/mutate Vendor B's product/order/payout → `FORBIDDEN`/`NOT_FOUND` per ownership check, not a data leak.
- Customer attempting to read another customer's order/invoice → same.
- Order cancellation attempted from a non-cancellable status (e.g., already `DELIVERED`) → state-machine rejects with `CONFLICT`.
- Referral repoint attempted by a non-`SUPER_ADMIN` → `FORBIDDEN`.

## 3. Data & environment for tests

- Integration/E2E tests run against a disposable, seeded test database (never staging/production).
- Seed data mirrors the live demo's demo accounts/roles conceptually (see the Live Testing doc §2) but with clearly fake data, regenerated per test run — never real PII, even in staging.
- Money assertions in tests are always in integer paise, matching the storage model — no floating-point comparison anywhere in the test suite either.

## 4. Coverage gates

- Financial domain modules (`commission`, `wallet`, `payout`, `tds-tax`, `payments`): target ≥90% branch coverage on the domain-logic layer specifically (not the whole codebase blended), since these are the modules where a missed branch is a money bug.
- Other modules: reasonable coverage, prioritizing state-machine transitions and permission checks over incidental UI logic.

## 5. What "done" means per module (ties to the brief's phase-end checklist)

After every module: run typecheck, run lint, run the test suite, verify the relevant Prisma migration applied cleanly against a fresh test DB, verify authorization (the specific unauthorized-access tests in §2 relevant to that module), verify responsive UI at mobile/tablet/desktop breakpoints, verify error/empty/loading states render correctly — not just the happy path.

## 6. Postman collection

Maintained alongside `api.md` §8 — every Route Handler gets a request in `postman/just-reference.postman_collection.json`, including at least one failure-mode request (bad auth, bad input, forbidden) per endpoint, not just the success case.
