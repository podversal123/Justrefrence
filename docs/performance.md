# Just Reference — Performance Strategy (Phase 0)

Target scale per [business-rules.md](business-rules.md) Q-46: ~10,000 users, ~1,000 orders/day in year 1. This document sets the concrete practices that keep the app fast at that scale and gives headroom well beyond it, tied to Core Web Vitals (LCP, INP, CLS) for the public-facing site and to query-cost discipline for the data-heavy admin/member panels.

## 1. Rendering strategy

- **Public pages** (catalog browse, product/service/project detail, blog): Server Components by default, statically generated or ISR-revalidated where content doesn't change per-request (see [caching.md](caching.md)) — this is what drives LCP down, since the HTML arrives pre-rendered rather than waiting on a client-side data fetch.
- **Authenticated pages** (member/admin panels): Server Components for the initial data-heavy render (orders list, wallet summary), Client Components only for the interactive slice (forms, filters, the cart drawer) — minimizes client JS shipped, which is the primary lever for INP.
- **Dynamic imports** for anything not needed on first paint: chart libraries on admin dashboards, the PDF/invoice preview, the Razorpay checkout script (loaded on-demand at the moment checkout starts, not on every page load).
- **CLS discipline:** every image has explicit `width`/`height` (or `fill` with a sized container); skeleton loading states (see below) reserve the same layout space the real content will occupy, so content never jumps in after data arrives.

## 2. Data access discipline (the brief's explicit "never fetch a whole table" rule)

- **Cursor pagination by default** for every collection endpoint that can grow unbounded — orders, wallet transactions, commission ledger, audit logs, member lists, notifications (see [api.md](api.md) §4). Offset pagination is reserved for small, bounded admin lists only.
- **No N+1 queries:** repository methods that return a list with related data (e.g., orders with their items) use Prisma's `include`/`select` to fetch in one query, not a loop of per-row queries. This is a specific, named review item in code review for any new list endpoint.
- **Selective field selection:** list endpoints select only the fields the list view actually renders (Prisma `select`), not the full row — particularly important for tables with large `jsonb` snapshot columns (`invoices.buyer_snapshot`, `payment_events.raw_payload`) that a list view never needs.
- **Indexes match query patterns:** every index called out in [database-tables.md](database-tables.md) exists because a specific, named query path needs it (ownership filters, status filters, the `ltree` GiST index for referral reads) — not spec­ulative indexing, and not under-indexing either.

## 3. Referral tree performance (the brief's specific callout)

Already addressed structurally in [ADR-0003](adr/0003-referral-tree-model.md): the `ltree`-indexed `referral_path` makes ancestor/descendant lookups O(log n) regardless of tree depth, replacing what would otherwise be a recursive CTE re-walked on every referral-list page load. This is the single highest-leverage performance decision in the schema, since referral reads are among the most frequent authenticated-page queries in a referral-commerce platform.

## 4. Background work off the request path

- Commission release (`/api/cron/release-commissions`), e-pin expiry (`/api/cron/expire-epins`), wallet reconciliation (`/api/cron/reconcile-wallets`) run as scheduled Vercel Cron jobs, never inline during a user's request — a user placing an order never waits on a batch job.
- PDF invoice generation happens asynchronously after order completion where possible (or synchronously but off the critical checkout path — the customer sees "order confirmed" before the PDF necessarily exists, with the invoice page itself generating-on-first-view if needed as a fallback).

## 5. Loading, empty, and error states (explicit requirement, not just a "nice UX" note)

Every data-bearing screen implements all four states, not just the happy path: **loading** (skeleton matching the real layout, not a spinner-only blank), **empty** (a specific "no orders yet" / "no referrals yet" message with a relevant call-to-action, not a blank table), **error** (a retry affordance, not a silent failure), **populated**. This is tracked as part of the phase-completion checklist in [testing.md §5](testing.md#5-what-done-means-per-module-ties-to-the-briefs-phase-end-checklist).

## 6. Realtime is a signal, not a payload

Supabase Realtime pushes are small "something changed, refetch" pings (see [api.md §9](api.md#9-realtime-channels-supabase-realtime), [notifications.md](notifications.md)), never the full changed object — this keeps the realtime channel cheap at scale and means a client always refetches through the same authorized, paginated Route Handler rather than trusting an unauthenticated-by-construction realtime payload as data.

## 7. Monitoring hooks (prepared in Phase 0, wired up in later phases)

Architecture leaves room for: Vercel Analytics/Speed Insights for Core Web Vitals in production, structured request logging with `requestId` correlation (see [error-handling.md](error-handling.md) §3) for latency/error-rate tracking per route, and slow-query logging on Supabase Postgres reviewed periodically against the indexing assumptions in [database-tables.md](database-tables.md) — so an index that turns out to be missing shows up as data, not as a production incident first.

## 8. What performance work is explicitly deferred

Load testing against the ~1,000-orders/day target, and any resulting index/query tuning, happens in Phase 11 (Testing/security/performance hardening) per the [README roadmap](../README.md#roadmap-phases-0-12) — Phase 0 sets the structural decisions (pagination, indexing philosophy, caching boundaries) that make that later tuning tractable, but does not itself run a load test against code that doesn't exist yet.
