# Justreference (justreference.in)

Multi-vendor referral-commerce platform: catalog (products/services/projects) + e-commerce (cart/orders/invoices) + referral & rewards engine (referral tree, commissions, wallet, e-pins/subscriptions, payouts, TDS reporting).

**Status: Phase 0 — architecture & requirements only. No application code exists in this repository yet**, by design: the brief this project follows requires the full architecture/database/RBAC/security/API design to be documented and reviewed before any implementation begins.

A prior live demo (simulated payments/SMS/WhatsApp/email) exists at `just-reference.onrender.com`; per [ADR-0009](docs/adr/0009-relationship-to-live-demo.md), this repository is a **fresh rebuild**, informed by that demo's behavior but not by its code.

## Phase 0 deliverables

| # | Deliverable | File |
|---|---|---|
| 1 | System architecture | [docs/architecture.md](docs/architecture.md) |
| 2 | High-level architecture diagram | [docs/diagrams.md](docs/diagrams.md) |
| 3 | Complete module breakdown | [docs/modules.md](docs/modules.md) |
| 4 | Database ERD | [docs/database.md](docs/database.md) |
| 5 | Database table specification (every table, column-level) | [docs/database-tables.md](docs/database-tables.md) |
| 6 | Relationship mapping | [docs/relationships.md](docs/relationships.md) |
| 7 | RBAC matrix | [docs/rbac.md](docs/rbac.md) |
| 8 | API architecture | [docs/api.md](docs/api.md) |
| 9 | Folder structure | [docs/architecture.md §5](docs/architecture.md#5-folder-structure) |
| 10 | Security architecture | [docs/security.md](docs/security.md) |
| 11 | Financial ledger architecture (Order→Payment→Commission→Wallet→Payout) | [docs/financial-ledger.md](docs/financial-ledger.md) |
| 12 | Referral/commission architecture | [docs/referral-commission.md](docs/referral-commission.md) |
| 13 | Payment architecture | [docs/payment-architecture.md](docs/payment-architecture.md) |
| 14 | Notification architecture | [docs/notifications.md](docs/notifications.md) |
| 15 | File upload architecture | [docs/file-upload.md](docs/file-upload.md) |
| 16 | Audit logging architecture | [docs/audit-logging.md](docs/audit-logging.md) |
| 17 | Error handling strategy | [docs/error-handling.md](docs/error-handling.md) |
| 18 | Caching strategy | [docs/caching.md](docs/caching.md) |
| 19 | Performance strategy | [docs/performance.md](docs/performance.md) |
| 20 | Testing strategy | [docs/testing.md](docs/testing.md) |
| 21 | Deployment architecture | [docs/deployment.md](docs/deployment.md) |
| 22 | Environment variable specification | [docs/environment.md](docs/environment.md) · [.env.example](.env.example) |
| 23 | Requirement conflicts | [docs/phase-0-decision-log.md § Requirement conflicts](docs/phase-0-decision-log.md#requirement-conflicts) |
| 24 | Open business decisions | [docs/business-rules.md](docs/business-rules.md) · [docs/phase-0-decision-log.md](docs/phase-0-decision-log.md) |
| 25 | ADR list | [docs/adr/README.md](docs/adr/README.md) |

**Closing summary (Blocking Questions / Non-Blocking Questions / Assumptions / Requirement Conflicts):** [docs/phase-0-decision-log.md](docs/phase-0-decision-log.md)

## Source documents (ground truth for scope — read before changing any business rule)

- `JustReference_Project_Proposal.pdf`, `JustReference_Project_Report.pdf`, `JustReference_Workflow_Document.pdf`, `JustReference_Project_Cost.pdf`
- `Justreference - Live Testing and Production Plan.docx` — contains the client's **Q-01–Q-48** open-questions list, which [docs/business-rules.md](docs/business-rules.md) is built from
- `Page 1.jpeg`–`Page 5.jpeg` — client's original handwritten requirement notes
- `Justreference Logo.jpeg` — brand mark (red globe/leaf "A" motif on a rounded-square field; use as the visual source of truth for the design system built in Phase 1)

## Roadmap (Phases 0–12)

| Phase | Scope |
|---|---|
| **0 — Requirements & architecture** *(this deliverable)* | Requirement analysis, architecture, ERD, security model, RBAC, folder structure, ADRs, API conventions |
| 1 | Project setup, design system, authentication, RBAC implementation, database foundation, audit logging |
| 2 | Admin/User/Vendor management |
| 3 | Product/Project/Service masters |
| 4 | Customer/member panel |
| 5 | Cart/order/checkout/invoices |
| 6 | Referral/commission engine |
| 7 | Wallet/e-pin/subscription/rewards |
| 8 | Payout/TDS/reporting |
| 9 | Messaging/support/notifications |
| 10 | Admin/Super Admin dashboards |
| 11 | Testing/security/performance hardening |
| 12 | Production deployment |

This matches the client's own three-month, week-by-week plan (`JustReference_Workflow_Document.pdf`) in substance — Phases 1–5 above correspond to that plan's Months 1–2, Phases 6–10 to Month 3, and Phases 11–12 to the client's own six-stage production-cutover plan (Live Testing doc §14: testing → decisions/scope-freeze → accounts/legal → production build → acceptance testing → go-live).

## Before Phase 1 starts — outstanding blockers

These are not implementation tasks; they are answers only the client (and, in places, their lawyer/CA) can give. Full list with recommended defaults in [docs/business-rules.md](docs/business-rules.md).

🔴 **Blocking Phase 1 module build** (money logic cannot be written without them):
- Q-01–Q-03, Q-06, Q-07 — referral depth, commission rate/basis, qualifying events, release timing, reversal policy
- Q-15 — who may generate e-pins
- Q-25 — bid payment settlement
- Q-29 — Super Admin feature scope (missing page 2 of the client's notes)
- Q-41 — written approval of the Next.js/PostgreSQL stack change from the originally-noted .NET/MS-SQL/IIS stack

🔴 **Blocking production go-live, not Phase 1 build** (build proceeds against documented defaults; production cutover is gated on these):
- Q-10, Q-14 — member transfers, "investment income" (legal review required)
- Q-18, Q-19 — TDS/GST rates (client's CA must confirm)
- Q-39 — full legal review of the referral/commission/wallet model
- Q-43 — SMS DLT registration, WhatsApp Business verification, Razorpay KYC (multi-week lead times — start now)

🟡/🟢 items (defaults already adopted, confirmation still wanted before go-live) are tracked in full in [docs/business-rules.md](docs/business-rules.md).

## Conflicts found across the source documents (see architecture.md §8 and the relevant ADRs for full resolution)

1. Backend hosting: Proposal/Report say Vercel+Supabase only; Cost doc (and the live demo) show Vercel+Render. Resolved in [ADR-0004](docs/adr/0004-hosting-topology.md).
2. Original stack (.NET/MS-SQL/IIS, per the client's handwritten notes) vs. proposed stack (Next.js/Postgres) — already flagged to the client as Q-41; unresolved until they confirm in writing.
3. Whether bidding/order-tracking/blog/advanced reporting are Phase 1 or Phase 2 scope — Proposal says later phase, Report/Workflow schedule them inside the 3-month Phase 1, and the live demo already implements a bidding demo. Treated as in-scope at "basic" level pending Q-44.

## Next steps

1. Client/stakeholder review of this full document set.
2. Resolve the 🔴 blocking-for-build items above (at minimum Q-01–Q-03, Q-06, Q-07, Q-15, Q-29, Q-41).
3. Confirm [ADR-0004](docs/adr/0004-hosting-topology.md)'s hosting topology and [ADR-0001](docs/adr/0001-orm-choice.md)'s ORM choice.
4. Kick off Phase 1: repository scaffold, `prisma/schema.prisma` generated from [docs/database.md](docs/database.md), design system, auth.
