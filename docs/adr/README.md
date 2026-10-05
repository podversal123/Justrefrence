# Architecture Decision Records — Index

| ADR | Title | Status |
|---|---|---|
| [0001](0001-orm-choice.md) | ORM — Prisma over Drizzle | Accepted |
| [0002](0002-money-representation.md) | Money stored as integer paise, ledger-first | Accepted |
| [0003](0003-referral-tree-model.md) | Referral tree via Postgres `ltree`, not recursive CTEs | Accepted |
| [0004](0004-hosting-topology.md) | Hosting topology — Vercel + Supabase only | Accepted, re-open trigger defined |
| [0005](0005-rbac-model.md) | Permission-based RBAC with defense-in-depth RLS | Accepted |
| [0006](0006-auth-strategy.md) | Supabase Auth + custom OTP/WhatsApp flow | Accepted |
| [0007](0007-pdf-generation.md) | `@react-pdf/renderer` for invoices | Accepted |
| [0008](0008-explicit-state-machines.md) | Explicit state-machine functions for status fields | Accepted |
| [0009](0009-relationship-to-live-demo.md) | Fresh rebuild, not a continuation of the live demo | Accepted |
| [0010](0010-vendor-profile-and-dynamic-roles.md) | Vendor profile hangs off `User` directly; roles become dynamic | Accepted |
| [0011](0011-catalog-architecture.md) | Catalog: three parallel model families, one shared application engine | Accepted |
| [0012](0012-otp-session-bridge.md) | Every account requires an email; mobile/WhatsApp OTP bridges to a session via a server-signed magic-link token | Accepted |
| [0013](0013-commerce-money-math.md) | Commerce money math — integer basis-point rates, checkout-level idempotency, no payment gateway yet | Accepted |
| [0014](0014-commission-engine.md) | Commission engine — mutable lifecycle status on an immutable financial record, order-level calculation base, rule versions as rows | Accepted |
| [0015](0015-wallet-epin-subscription.md) | Wallet race-safety via conditional updates, e-pin keyed-hash lookup, transfer built dormant | Accepted |
| [0016](0016-razorpay-payment-integration.md) | Payment keyed to Checkout not Order, dual signature paths with the webhook authoritative, fetch() over the Razorpay SDK | Accepted |

New ADRs are numbered sequentially and added to this table when they land — an ADR is never edited retroactively to change its decision; a changed decision gets a new ADR that supersedes the old one, with the old one's Status updated to `Superseded by ADR-00xx`.
