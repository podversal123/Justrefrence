# Just Reference — System Architecture (Phase 0)

Status: **Draft for client/architecture sign-off** — no implementation code exists yet. This document, plus the rest of `/docs`, is the gate the build brief requires before Phase 1 starts.

Source of truth for scope: `JustReference_Project_Proposal.pdf`, `JustReference_Project_Report.pdf`, `JustReference_Workflow_Document.pdf`, `JustReference_Project_Cost.pdf`, `Just Reference - Live Testing and Production Plan.docx`, and the client's handwritten notes (`Page 1–5.jpeg`). A previous build already exists as a **live demo** at `just-reference.onrender.com` with simulated money/SMS/WhatsApp/email. Per project decision, this repository is a **fresh implementation**, informed by that demo's behavior but not inheriting its code — see [ADR-0009](adr/0009-relationship-to-live-demo.md).

---

## 1. What this system is

Just Reference is a multi-vendor referral-commerce platform: a standard e-commerce marketplace (products, projects, services, cart, orders, invoices) layered with a referral/MLM-style earnings engine (referral tree, commissions, rewards, e-pins/subscriptions, wallet, payouts, TDS reporting). Every member (a single account) can be a buyer, a referrer, and — once approved — a vendor, simultaneously. Money correctness, auditability, and configurability of business rules (commission %, TDS, GST, fees) are the dominant non-functional requirements; the UI/UX and catalog features are comparatively conventional.

## 2. Layering rule (mandatory)

```
UI (Server/Client Components)
        ↓
Route Handlers / Server Actions   (thin — auth check, input parse, call a service, map result)
        ↓
Application Services              (use-case orchestration, transaction boundaries)
        ↓
Domain Services                   (business rules: commission calc, order state machine, wallet invariants)
        ↓
Repositories (Prisma)             (data access only — no business logic)
        ↓
PostgreSQL (Supabase)
```

Rules enforced by code review / lint, not just convention:

- React components and Server Actions/Route Handlers **must not** contain money math, commission logic, or wallet mutation logic. They call a service function and render/return its result.
- **Financial logic** (`src/server/domain/wallet`, `.../commission`, `.../payout`, `.../tds`) is isolated from presentation and from order logic. Order logic calls wallet/commission services through defined interfaces; it never writes to `wallet_transactions` or `commission_ledger` directly.
- **Referral logic** (`src/server/domain/referral`) is isolated from order logic. Orders emit a domain event (`OrderCompleted`, `OrderRefunded`) that the commission engine subscribes to; orders do not compute commissions inline.
- **Repositories** contain no `if` on business state beyond simple query filters — state transitions live in domain services.

This gives us: every financial computation is unit-testable without HTTP or DB, every module can be audited independently, and "referral logic changed" never means "reread the checkout code."

## 3. Module boundaries (bounded contexts)

| Module | Owns | Talks to other modules only via |
|---|---|---|
| `identity` | users, auth, roles/permissions, sessions, OTP | — (foundational) |
| `catalog` | products, services, projects + categories, images, approval state | `identity` (vendor ownership) |
| `cart-checkout` | cart, cart items, checkout session | `catalog` (pricing snapshot), `payments` |
| `orders` | orders, order items, vendor order groups, state machine | emits events; never touches wallet/commission tables |
| `payments` | Razorpay orders, payment verification, webhooks, idempotency | emits `PaymentConfirmed` event |
| `invoicing` | invoice generation, GST computation, PDF | reads order snapshot (read-only) |
| `referral` | referral relationships/tree, referral codes | reads `identity`; emits nothing into orders |
| `commission` | commission rules, commission ledger, calculation engine | subscribes to `OrderCompleted`/`OrderRefunded`/`PaymentConfirmed` |
| `wallet` | wallet balance (derived), wallet ledger, transfers, holds | called by `commission`, `payout`, `payments` (top-up), never called by UI directly for balance changes |
| `payout` | payout requests, approval workflow, bank transfer record | debits `wallet` inside a transaction |
| `epin-subscription` | e-pin generation/redemption, subscription plans | credits `commission`/`referral` eligibility flags |
| `coupon-reward` | coupons, redemptions, rewards | reads `orders` at checkout (read-only validation) |
| `tds-tax` | TDS/GST rule versions, TDS ledger, reports | subscribes to `commission`/`payout` events |
| `bidding` | requirements, sealed bids, acceptance | hands off to `orders`/`payments` once payment rules are defined (currently unplugged — see business-rules.md Q-25) |
| `messaging-support` | internal messages, tickets, notifications | fan-in from all modules for notification triggers |
| `admin-ops` | member blocking, feedback, settings, maintenance mode, banners, blog | reads across modules; RBAC-gated |
| `audit` | immutable audit log | written to by every module via one shared `audit.record()` call — never read-modify-write |

Modules map 1:1 to folders under `src/server/domain/*` and to Prisma schema sections. A module's repository is the only code allowed to run Prisma queries against its own tables.

## 4. Technology stack (as proposed, confirmed)

| Layer | Choice | Notes |
|---|---|---|
| Frontend | Next.js 15 (App Router), TypeScript (strict), Tailwind CSS, shadcn/ui | Server Components by default; Client Components only for interactivity |
| Client state | TanStack Query (server-state caching) + Zustand (genuine client-only global state: cart drawer open/closed, wizard steps, wallet-PIN modal) | React Query is not used to store business truth — it caches what the server returns |
| Backend | Next.js Route Handlers + Server Actions | Server Actions for form-bound mutations from Server Components; Route Handlers for anything called by webhooks, mobile clients, or Postman/external testing |
| ORM | **Prisma** over PostgreSQL | See [ADR-0001](adr/0001-orm-choice.md) |
| Database | Supabase PostgreSQL | Single source of truth; RLS is **not** relied on for authorization (see §7) — Prisma runs with the service role from trusted server code only |
| Auth | Supabase Auth (email + password, email OTP) for session issuance; custom mobile-OTP and WhatsApp-OTP flow (MSG91) that mints a Supabase session server-side after verification | See [ADR-0006](adr/0006-auth-strategy.md) |
| Storage | Supabase Storage (product/service/project images, KYC docs, invoice PDFs) | Private buckets for KYC/invoices with signed URLs; public bucket for catalog images |
| Realtime | Supabase Realtime | Scoped to: wallet balance updates, order status changes, notification bell, internal messaging — not used as a source of truth, only as a push channel that triggers a React Query refetch |
| Payments | Razorpay (Orders API + Webhooks) | Server-side signature verification mandatory; see [security.md](security.md) |
| SMS/OTP | MSG91 (primary, per Cost doc) with Twilio as documented fallback option | Abstracted behind an `SmsProvider` interface so the concrete vendor is swappable |
| WhatsApp | MSG91 WhatsApp Business API | Same abstraction pattern (`WhatsAppProvider`) |
| Email | Resend (primary) / Supabase SMTP (fallback) | `EmailProvider` interface |
| PDF | `@react-pdf/renderer` for invoices (fast, no headless Chrome needed for a fixed-layout document); Puppeteer reserved for any future full-HTML report export | See [ADR-0007](adr/0007-pdf-generation.md) |
| Hosting | Vercel (application) + Supabase Cloud (database/auth/storage/realtime) | **Conflicts with the Cost doc's Vercel+Render topology — flagged and resolved in** [ADR-0004](adr/0004-hosting-topology.md) |
| Testing | Vitest/Jest (unit), Playwright (E2E), Supertest-style integration tests against Route Handlers, Postman collection (exported to repo) | See [testing.md](testing.md) |

## 5. Folder structure

```
justreference/
├── docs/                          # this Phase 0 documentation set
│   └── adr/
├── prisma/
│   ├── schema.prisma
│   ├── migrations/
│   └── seed.ts
├── src/
│   ├── app/                       # Next.js App Router
│   │   ├── (public)/              # marketing site, catalog browse, SEO pages
│   │   │   ├── products/
│   │   │   ├── services/
│   │   │   ├── projects/
│   │   │   └── blog/
│   │   ├── (auth)/                # sign-up, login, OTP verify, password reset
│   │   ├── (member)/              # customer + vendor shared shell (role-gated tabs inside)
│   │   │   ├── dashboard/
│   │   │   ├── profile/
│   │   │   ├── orders/
│   │   │   ├── wallet/
│   │   │   ├── referrals/
│   │   │   ├── epin/
│   │   │   ├── support/
│   │   │   └── vendor/            # only rendered if the member holds VENDOR role
│   │   ├── (admin)/                # ADMIN / FINANCE / SUPPORT role-gated
│   │   ├── (super-admin)/          # SUPER_ADMIN only: settings, commission rules, audit
│   │   └── api/                    # Route Handlers: webhooks, external-facing REST, cron
│   │       ├── webhooks/razorpay/
│   │       ├── webhooks/msg91/
│   │       ├── v1/...               # versioned REST surface (see api.md)
│   │       └── cron/
│   ├── server/
│   │   ├── domain/                 # one folder per bounded context (see §3), pure business logic
│   │   │   ├── identity/
│   │   │   ├── catalog/
│   │   │   ├── orders/
│   │   │   ├── payments/
│   │   │   ├── referral/
│   │   │   ├── commission/
│   │   │   ├── wallet/
│   │   │   ├── payout/
│   │   │   ├── epin/
│   │   │   ├── coupon-reward/
│   │   │   ├── tds-tax/
│   │   │   ├── bidding/
│   │   │   ├── messaging/
│   │   │   └── audit/
│   │   ├── repositories/           # Prisma queries, one file per aggregate, mirrors domain/
│   │   ├── services/                # application services = use-case orchestration, calls 1+ domain modules, owns the Prisma transaction boundary
│   │   ├── auth/                    # session/permission resolution helpers used by Route Handlers & Server Actions
│   │   └── lib/                     # provider adapters (Razorpay, MSG91, Resend, Supabase Storage), idempotency helpers
│   ├── lib/                         # framework-agnostic shared utils (money formatting, zod schemas shared client+server)
│   ├── components/                  # shadcn/ui-based design system components
│   ├── hooks/                       # React Query hooks, Zustand stores
│   └── types/                       # shared TS types / zod-inferred types
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── postman/
│   └── just-reference.postman_collection.json
├── .env.example
└── package.json
```

Rationale: route groups `(public)/(auth)/(member)/(admin)/(super-admin)` give each audience its own layout, middleware guard, and metadata strategy (public needs SEO; admin/member do not), while sharing the same design system and domain layer underneath.

## 6. Cross-cutting mechanisms

**State machines.** Order status, project workflow status, and bid status are each implemented as an explicit state machine (`src/server/domain/*/state-machine.ts`) with a `transition(current, event, actor) → next | throws InvalidTransitionError`. No code path sets a status column directly; every write goes through the transition function so illegal transitions (e.g., `DELIVERED → PLACED`) are structurally impossible. Statuses in scope for Phase 1 (subject to Q-26 confirmation): `PLACED → PAID → PROCESSING → SHIPPED/DELIVERED → COMPLETED`, with `CANCELLED` and `REFUNDED` reachable from the appropriate earlier states.

**Idempotency.** Every endpoint that an external system can retry (Razorpay webhook, MSG91 delivery callback) requires an idempotency key (Razorpay's `event.id` / our own generated key for internal retries) recorded in `webhook_events` with a unique constraint, checked before any side effect runs.

**Referral tree scalability.** Ancestor/descendant lookups (for commission fan-out and referral list pages) do not use recursive CTEs at request time. See [database.md §Referral tree](database.md#referral-tree-model) for the chosen `ltree`-based closure model.

**Money.** All amounts are integer paise (`bigint`), currency is an explicit `char(3)` ISO 4217 column (default `INR`), and every balance-affecting action inserts an immutable ledger row inside the same DB transaction as the balance-affecting write. See [database.md §Money model](database.md#money-model).

**Configuration over hardcoding.** Commission rates/levels, TDS rules, GST rates, platform fees, e-pin prices, subscription plans, coupon rules and reward rules are all rows in versioned config tables (`commission_rules`, `tds_rules`, `subscription_plans`, …), editable only by `SUPER_ADMIN`/`FINANCE` through audited settings screens — never constants in code. See [business-rules.md](business-rules.md) for which specific numbers are still unconfirmed by the client.

## 7. Authorization model summary

Full matrix in [rbac.md](rbac.md). Headline decisions:

- Permission-based, not role-string checks: every protected Server Action / Route Handler calls `requirePermission(session, "wallet:withdraw")`, not `requireRole(session, "CUSTOMER")`.
- **Six** roles at launch: `SUPER_ADMIN, ADMIN, FINANCE, SUPPORT, VENDOR, CUSTOMER` (matches the live demo's role set exactly). A single user can hold `CUSTOMER` and `VENDOR` simultaneously (vendor is an upgrade, not a separate account — confirmed by Q-31's suggested default).
- Supabase Row-Level Security is **enabled defensively** on every table (deny-by-default) as a second line of defense, but the application does not depend on RLS for its authorization decisions — all authorization happens in the service layer, because RLS policies expressive enough for "role + permission + resource ownership + business-rule state" are hard to keep auditable. This is intentional defense-in-depth, not a shortcut.
- Every protected operation validates, in order: authentication → role → permission → resource ownership → business-rule state (e.g., "order is in a cancellable state") → account status (not blocked/blacklisted). A single `authorize()` helper in `src/server/auth` runs all five checks and is unit-tested independently of any route.

## 8. Open architectural conflicts found in the source documents

| Conflict | Where | Resolution |
|---|---|---|
| Backend hosting: "Vercel (app) + Supabase Cloud (backend)" (Proposal/Report) vs. "Vercel (frontend) + Render (backend, paid Node instance)" (Cost doc); live demo is actually hosted on Render | Proposal §8 / Report §6 vs. Cost doc §3 | See [ADR-0004](adr/0004-hosting-topology.md): default to Vercel-only (Next.js Route Handlers ARE the backend; no separate Node service needed for Phase 1). Render is kept as a documented fallback only if a genuine need for a long-running/non-serverless process emerges (see ADR for triggers). **Flagged to client as part of Q-41 (stack confirmation).** |
| Original client tech stack (.NET Core Web API, MS-SQL, IIS, iTextSharp/MSGraph — per handwritten notes, `Page 5.jpeg`) vs. proposed stack (Next.js/Postgres/Supabase) | `Page 5.jpeg` vs. Proposal §8 | Already surfaced to the client as **Q-41** in the Live Testing doc; this document assumes the Next.js/Postgres stack is approved, since it is what both the Proposal and the live demo use. **Still formally unconfirmed — do not remove Q-41 from the open list.** |
| Timeline says "Order tracking, bidding, blog, advanced reporting" are **later-phase** (Proposal §2) vs. Report/Workflow schedule them **inside** the 3-month Phase 1 (Week 6–11) vs. the live demo already implements a bidding demo | Proposal §2 vs. Report §3/Workflow | Treat as in-scope for Phase 1 at "basic" level (matches Report/Workflow, matches what's already live), with bidding payment settlement explicitly unplugged pending Q-25/Q-44 ("what exactly counts as basic"). |

REQUIREMENT_DECISION_REQUIRED items that affect business logic (not architecture) are tracked centrally in [business-rules.md](business-rules.md), carried forward from the client's own Q-01–Q-48 list rather than re-derived.

## 9. What Phase 0 does **not** decide yet

No code, no Prisma schema file, no deployed environment. Those begin in Phase 1 once this document set (`architecture.md`, `database.md`, `rbac.md`, `security.md`, `api.md`, `business-rules.md`, `deployment.md`, `environment.md`, `testing.md`, ADRs) is reviewed. See [roadmap in the top-level README](../README.md).
