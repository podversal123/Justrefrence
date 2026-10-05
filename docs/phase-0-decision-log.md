# Just Reference — Phase 0 Decision Log

Closing summary requested in this format. Every item is sourced from the client's own documents (`JustReference_Project_Proposal.pdf`, `_Report.pdf`, `_Workflow_Document.pdf`, `_Project_Cost.pdf`, `Just Reference - Live Testing and Production Plan.docx`, and the handwritten `Page 1–5.jpeg`) or from a conflict/gap directly observed between them. Nothing below is an invented business rule — where a number or rule is missing from the source documents, it is listed as an open question, not filled in. Full detail and recommended defaults for every item are in [business-rules.md](business-rules.md); this page is the scannable index.

---

## BLOCKING QUESTIONS

Money logic or legal exposure — Phase 1 cannot build the affected module, or cannot go to production, without these.

| # | Question | Blocks |
|---|---|---|
| Q-01 | Referral depth: is "indirect" exactly level 2 or unlimited? What does "Search Business" mean? | Commission engine, referral UI |
| Q-02 | Commission rate per level — percent of order / vendor sale / platform fee, or fixed? Same across products/services/projects? | Commission engine (core money logic) |
| Q-03 | Which events earn commission (purchase, e-pin, subscription, joining fee, wallet top-up)? | Commission engine |
| Q-06 | When is a commission withdrawable — at payment, delivery, or after a return window (how many days)? | Wallet `PENDING` vs. `AVAILABLE` split |
| Q-07 | Refund/cancellation: full commission reversal? Negative balance allowed, or recovered from future earnings? | Wallet invariants, refund handling |
| Q-10 | Are member-to-member wallet transfers in scope? (Possible RBI prepaid-instrument implications) | Wallet module scope — **legal-gated** |
| Q-14 | What do "Investment Income" / "Withdrawn A/C Balance" mean? Does the platform pay returns on deposits? | Wallet/reporting scope — **legal-gated, highest priority** |
| Q-15 | Who may generate e-pins — admin only, or members too? Price? Transferable? | E-pin module build |
| Q-18 | TDS section/rate/threshold/no-PAN rate/deduction point — **requires the client's CA** | Go-live (not Phase 1 build) |
| Q-19 | GST: vendor-issued or platform-issued invoices? Rates/HSN per category? GSTIN mandatory? — **requires the client's CA** | Go-live (not Phase 1 build) |
| Q-25 | How does an accepted bid become a paid, fulfilled order? | Bidding→payment handoff |
| Q-29 | Super Admin feature list — page 2 of the client's handwritten notes is missing | Super Admin panel finalization |
| Q-39 | Has the referral/commission/wallet/e-pin model had a legal review (direct-selling, money-circulation, RBI wallet rules)? Which entity is the merchant of record? | Production go-live — **precondition, highest priority** |
| Q-41 | Written approval of the Next.js/PostgreSQL stack, replacing the originally-noted .NET/MS-SQL/IIS stack | Contractual — this whole architecture assumes approval |
| Q-43 | Status of SMS DLT registration, WhatsApp Business (Meta) verification, Razorpay KYC | Production go-live (multi-week lead times) |

## NON-BLOCKING QUESTIONS

Confirmable before go-live without blocking Phase 1 build — a documented default is already adopted and the schema accommodates either answer.

| # | Question | Default already adopted |
|---|---|---|
| Q-04 | Must a referrer hold an active subscription/e-pin to earn? Minimum activity? | Eligibility predicate on `commission_rules`, currently unset |
| Q-05 | Can a referrer change after sign-up? | Locked at signup; `SUPER_ADMIN`-only repoint, audited |
| Q-08 | Reward/bonus/coupon triggers, types, expiry | Manual grant + coupon redemption only; no auto-trigger built |
| Q-09 | Wallet top-up min/max; can balance pay for orders? | Top-up via Razorpay only; balance can pay for orders |
| Q-11 | Withdrawal min/max/fee/frequency/checks | Verified email + PAN + bank required first |
| Q-12 | Manual admin payout vs. automated provider | Manual, second-approver required |
| Q-13 | Separate wallet PIN? | Optional 6-digit code |
| Q-16 | Subscription plan definitions/prices/renewal | Schema supports yearly/time-bound/lifetime; no real prices seeded |
| Q-17 | Is a subscription mandatory to join/sell/earn? | Open — feeds Q-04's eligibility predicate |
| Q-20 | Vendor platform-fee rate and settlement | Settled to vendor wallet after return window; rate TBD |
| Q-21 | Product fields, courier integration, return policy | Basic fields + stock; no courier integration Phase 1 |
| Q-22 | Approval required for all listing types? | Yes, switchable per type |
| Q-23 | Project payment flow — advance/balance vs. milestones/escrow | Advance + balance; milestones schema present, inactive |
| Q-24 | Service pricing — fixed vs. quote | Fixed price by default |
| Q-26 | Exact order status set and who may change each | `PLACED→PAID→PROCESSING→SHIPPED/DELIVERED→COMPLETED` + `CANCELLED`/`REFUNDED` |
| Q-27 | One order or many per multi-vendor cart? | One order per vendor |
| Q-28 | Payment methods — COD in scope? | Razorpay online methods only |
| Q-30 | Admin sub-roles / "vendor rights" contents | `FINANCE`/`SUPPORT` sub-roles; vendor rights = `VENDOR` permission bundle |
| Q-31 | Vendor onboarding — self-apply or admin-created? | Member applies, admin approves |
| Q-32 | Member ID format / can it be used to log in? | Display-only; login by email/mobile |
| Q-33 | Login method, mandatory mobile verification, WhatsApp scope | Password login; email verified at signup; mobile verified before payout |
| Q-34 | Undefined demo items (security codes, advertisement, SMS inbox, like-tab, bell SMS) | Adopted from the live demo's own working definitions |
| Q-35 | Messaging scope; feedback collection | Admin↔any member; feedback form |
| Q-36 | Blog authorship | Admin-only |
| Q-37 | Idle logout, birthday channel, welcome-letter format | 30 min; email; email + in-app |
| Q-38 | Mandatory KYC docs, manual vs. automated check | PAN + bank, manual check; Aadhaar not stored |
| Q-40 | Data retention / DPDP deletion handling | Retain per statutory period; anonymize on request, ledger rows never deleted |
| Q-42 | Who owns/pays for third-party accounts? | Client owns and pays for all |
| Q-44 | What exactly is "basic" scope for bidding/tracking/blog/reports? | To be frozen in writing per the client's own six-phase plan |
| Q-46 | Expected scale, backup/restore time, languages | ~10,000 users, ~1,000 orders/day, English-only |
| Q-48 | Support contact | Single shared address/phone |

## ASSUMPTIONS

Positions this architecture takes where no source document states one explicitly, or where an architectural choice was required to proceed. Each is documented in full (with alternatives considered) in its linked ADR or doc — listed here as assumptions, not settled facts, per the brief's "do not invent answers" instruction.

- **This is a fresh rebuild**, not a continuation of the live demo's actual codebase, per explicit project decision — [ADR-0009](adr/0009-relationship-to-live-demo.md).
- **Backend = Vercel serverless (Next.js Route Handlers/Server Actions) only**, no separate Render/Node service, resolving a conflict between the Proposal/Report and the Cost doc — [ADR-0004](adr/0004-hosting-topology.md). Flagged to the client as part of Q-41.
- **ORM = Prisma**, per the brief's explicit "choose one and document why" — [ADR-0001](adr/0001-orm-choice.md).
- **Money = integer paise, ledger-first, insert-only financial tables** — [ADR-0002](adr/0002-money-representation.md).
- **Referral tree = Postgres `ltree`**, not a recursive CTE or separate closure table — [ADR-0003](adr/0003-referral-tree-model.md).
- **RBAC = permission-based with defense-in-depth RLS**, not primary-RLS or bare role-string checks — [ADR-0005](adr/0005-rbac-model.md).
- **A member and a vendor are the same account** — `VENDOR` is an additive role granted after approval, not a separate signup flow (built on Q-31's suggested default, treated as settled enough to build against since it matches the live demo).
- **Invoice PDFs are generated server-side** (`@react-pdf/renderer`), changing from the live demo's browser-print approach — [ADR-0007](adr/0007-pdf-generation.md); flagged as an explicit item to confirm with the client rather than silently carried over.
- **Bidding, order tracking, and basic reporting are in-scope for Phase 1** (matching the Report/Workflow documents and the live demo) rather than deferred to Phase 2 (as the Proposal alone suggests) — see Requirement Conflicts below.
- **Target scale is ~10,000 users / ~1,000 orders per day** (Q-46's suggested figure), used to justify cursor pagination, the `ltree` indexing choice, and the caching strategy — see [performance.md](performance.md).
- **No malware/AV scanning service** is integrated in Phase 1; file-upload safety relies on MIME allowlisting, content-sniffing, and mandatory image re-encoding — see [file-upload.md](file-upload.md) §6.

## REQUIREMENT CONFLICTS

Direct contradictions found between the client's own source documents, or between those documents and the live demo's actual behavior.

1. **Backend hosting.** `JustReference_Project_Proposal.pdf` §8 and `JustReference_Project_Report.pdf` §6 both specify "Vercel (app) + Supabase Cloud (backend)" — no separate backend service. `JustReference_Project_Cost.pdf` §3/§3.1 lists Render as a required, separately-costed backend hosting line item, and the live demo is in fact deployed on Render (`just-reference.onrender.com`). **Resolved for this build** in favor of Vercel+Supabase-only, per [ADR-0004](adr/0004-hosting-topology.md), with an explicit re-open trigger — not silently picked, and flagged back to the client.

2. **Technology stack.** The client's original handwritten notes (`Page 5.jpeg`) specify .NET Core Web API, HTML/CSS/JS/jQuery/Bootstrap, MS-SQL Server, IIS, and iTextSharp/MSGraph for reporting. The Proposal, Report, and the live demo all use Next.js/PostgreSQL/Supabase instead. This is already flagged by the client's own team as **Q-41** and remains formally unconfirmed — this document set proceeds on the Next.js/Postgres stack because it's what's actually built and proposed twice, but written client sign-off is still outstanding.

3. **Phase 1 vs. Phase 2 scope for bidding/tracking/blog/reporting.** `JustReference_Project_Proposal.pdf` §2 states "Order tracking, bidding, blog, and advanced reporting beyond what's listed below will be scoped as later phases." `JustReference_Project_Report.pdf` §3 and `JustReference_Workflow_Document.pdf` (Weeks 6–11) schedule bidding, order tracking, and a blog/social-media section **inside** the 3-month Phase 1, and the live demo already implements a bidding flow. **Resolved for this build**: treated as in-scope at a "basic" level (matching the majority of the source documents and the live demo), with the exact meaning of "basic" left as **Q-44**, still open.

4. **Cost document's Phase 1 scope note vs. detailed module lists.** `JustReference_Project_Cost.pdf` describes Phase 1 cost as covering "all modules as listed in this report" without itself listing modules, while the Proposal/Report/Workflow documents disagree with each other (per conflict #3 above) on exactly which modules that phrase covers — not a new conflict, but worth noting the Cost document doesn't independently resolve #3, it just assumes whichever scope is agreed.
