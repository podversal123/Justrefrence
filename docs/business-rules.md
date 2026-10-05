# Just Reference — Business Rules & Requirement Decision Log (Phase 0)

This is the authoritative "what's still ambiguous" register the build brief requires. Per project decision, it is built from the client's own **Q-01–Q-48** list already sent in `Just Reference - Live Testing and Production Plan.docx` (dated 2026-09-22), rather than re-derived independently — that list was produced by testing the live demo against the client's original notes and already reflects real gaps, not hypothetical ones. Every item below follows the brief's required format. "Suggested default" is the recommendation already given to the client in that document; **nothing below is built into Phase 1 code as a hardcoded rule** — every rate/threshold/switch is a row in a configuration table (see [database.md](database.md)) that `SUPER_ADMIN`/`FINANCE` set once confirmed.

Status legend: 🔴 **blocking** (money/legal — cannot go live without it) · 🟡 **needed before Phase 1 module build** · 🟢 **needed before go-live, not before build starts** (schema/architecture already accommodates either answer).

---

## A. Referral & commission

### REQUIREMENT_DECISION_REQUIRED — Q-01: Referral depth & "Search Business"
- **Unclear:** Notes say "Direct" and "In-Direct." Is indirect exactly level 2, or unlimited depth? What does "Search Business" (mentioned in the member earnings tabs) mean as a distinct figure from direct/indirect/total?
- **Interpretations:** (a) 2-level flat system (direct + one indirect level); (b) unlimited-depth MLM-style tree with a configurable number of paying levels; (c) "Search Business" = earnings from members the user found via platform search/discovery rather than a direct invite (a separate attribution channel, not a tree depth).
- **Affected:** `referral_relationships`, `commission_rules.level`, referral tree UI, commission engine.
- **Recommended implementation:** Schema supports unlimited depth via the `ltree` path model ([database.md](database.md#referral-tree-model)); only the number of levels configured as **active** in `commission_rules` actually pays out, so this can be answered later without a schema change. "Search Business" is left as an undefined figure in the UI (shown as 0/blank) until defined.
- **Status:** 🔴 blocking for commission engine build.

### REQUIREMENT_DECISION_REQUIRED — Q-02: Commission rate & basis
- **Unclear:** Rate per level; is it % of order value, % of vendor's sale, % of platform fee, or a fixed amount; same rate for products/services/projects or different?
- **Recommended implementation:** No default possible. `commission_rules` schema supports per-level, per-`applies_to`-type, versioned rates (`PERCENT_OF_ORDER / PERCENT_OF_VENDOR_SALE / PERCENT_OF_PLATFORM_FEE / FIXED`).
- **Status:** 🔴 blocking — this is the core of the money logic; commission engine cannot be built without it.

### REQUIREMENT_DECISION_REQUIRED — Q-03: Qualifying events
- **Unclear:** Which events earn commission — product/service/project purchase, e-pin/subscription purchase, joining fee, wallet top-up?
- **Recommended implementation:** `commission_rules.qualifying_event` enum, extensible; no event triggers a commission by default until listed here.
- **Status:** 🔴 blocking.

### REQUIREMENT_DECISION_REQUIRED — Q-04: Referrer eligibility
- **Unclear:** Must the referrer hold an active subscription/e-pin to earn? Minimum activity threshold?
- **Recommended implementation:** `commission_rules` gains an `eligibility_predicate` (active-subscription flag + optional minimum-activity threshold), evaluated at commission-creation time, not retroactively.
- **Status:** 🟡.

### REQUIREMENT_DECISION_REQUIRED — Q-05: Referrer assignment & change
- **Unclear:** Can a member's referrer change after sign-up? Can an "NA" member be linked later? Is the referral code the same as Member ID? Which invite channels count?
- **Suggested default (adopted):** Referrer is locked at sign-up; only `SUPER_ADMIN` may change it, and the change is recorded in `audit_logs` (`referral:repoint` permission, see [rbac.md](rbac.md)).
- **Affected:** `referral_relationships.changed_by/changed_at`, `referral:repoint` permission.
- **Status:** 🟢 default adopted; confirm before go-live.

### REQUIREMENT_DECISION_REQUIRED — Q-06: Commission release timing
- **Unclear:** Withdrawable at payment, at delivery, or after a return window — how many days?
- **Suggested default (adopted):** `commission_ledger.status = PENDING` until order `COMPLETED` and the return window has passed; `release_after` computed from a configurable window (days TBD).
- **Status:** 🔴 blocking — determines `PENDING` vs `AVAILABLE` wallet balance split.

### REQUIREMENT_DECISION_REQUIRED — Q-07: Refund/cancellation reversal
- **Unclear:** Full reversal on refund/cancel? If already withdrawn, does wallet go negative or is it recovered from future earnings?
- **Suggested default (adopted):** Reverse in full via an offsetting `commission_ledger` row (`status=REVERSED`); wallet **never** goes negative (`wallets.balance CHECK >= 0`); shortfall is recovered by offsetting future commission credits.
- **Status:** 🔴 blocking — this is the exact scenario the brief's testing checklist calls out ("refund after commission already withdrawn").

### REQUIREMENT_DECISION_REQUIRED — Q-08: Rewards/bonus/coupon triggers
- **Unclear:** What triggers each reward type, which types (cash/coupon/other), expiry rules, checkout usability.
- **Recommended implementation:** `rewards`/`reward_transactions` schema present; no automatic reward trigger is implemented in Phase 1 beyond manual admin grant + coupon redemption, which already works (per Live Testing doc §15).
- **Status:** 🟡.

## B. Wallet & payouts

### REQUIREMENT_DECISION_REQUIRED — Q-09: Wallet top-up limits & spend
- **Unclear:** Min/max top-up amount; can balance pay for orders?
- **Suggested default (adopted):** Top-up via Razorpay only; balance can pay for orders (checkout accepts wallet as a payment method alongside Razorpay).
- **Status:** 🟡 (amounts TBD).

### REQUIREMENT_DECISION_REQUIRED — Q-10: Member-to-member transfers ⚠️ legal
- **Unclear:** Do "Transfer Funds" and "Balance transfer" mean member-to-member transfer? What's the difference between the two labels in the notes?
- **Why it matters:** A wallet that allows peer-to-peer transfer can be treated as a prepaid payment instrument under RBI regulation — a materially different compliance posture than a single-owner earnings wallet.
- **Recommended implementation:** `wallet:transfer` permission and the transfer endpoint exist in the RBAC/API design but are **not implemented/enabled** until legal review confirms scope.
- **Status:** 🔴 blocking, legal-gated — do not build until Q-39 legal review + explicit sign-off on this specific question.

### REQUIREMENT_DECISION_REQUIRED — Q-11: Withdrawal rules
- **Unclear:** Minimum/maximum per day, fee, frequency, which verification is required first (PAN vs bank).
- **Suggested default (adopted):** Require verified email, PAN, and bank account before a payout request is accepted; specific amount limits TBD.
- **Status:** 🟡.

### REQUIREMENT_DECISION_REQUIRED — Q-12: Payout mechanism
- **Unclear:** Manual admin bank transfer vs. an automated payout provider (e.g. Razorpay X)?
- **Suggested default (adopted):** Phase 1 = manual bank transfer recorded by `FINANCE`, approved by a **second** person distinct from the requester (enforced: `payout_requests.approved_by != requested_by`, and — for staff-initiated payouts — a second `FINANCE`/`SUPER_ADMIN` approver). Automated payout provider integration deferred, schema (`payout_transactions.provider_reference`) left open for it.
- **Status:** 🟡 default adopted; confirm before go-live.

### REQUIREMENT_DECISION_REQUIRED — Q-13: Wallet PIN
- **Unclear:** Is a separate wallet PIN/security code wanted for money actions, distinct from login password?
- **Suggested default (adopted):** Optional 6-digit wallet security code (`wallets.wallet_pin_hash`), required for withdrawal/payout actions when set.
- **Status:** 🟢 default adopted (already built in demo).

### REQUIREMENT_DECISION_REQUIRED — Q-14: "Investment Income" / "Withdrawn A/C Balance" ⚠️ legal — highest caution
- **Unclear:** What do these admin-panel line items mean? Does the platform accept member deposits and pay a return on them?
- **Why it matters:** If yes, this resembles a deposit-taking / money-circulation scheme and carries serious regulatory exposure independent of the referral-commission model itself.
- **Recommended implementation:** **Not built.** No schema, no UI beyond a placeholder, until the client explains the intended meaning **and** their lawyer reviews it in writing.
- **Status:** 🔴 blocking, legal-gated, highest priority to resolve or explicitly drop from scope.

## C. E-pins & subscriptions

### REQUIREMENT_DECISION_REQUIRED — Q-15: E-pin definition & generation rights
- **Unclear:** Is an e-pin a prepaid activation code? Who buys it? Who may generate one — admin only, or members for a "special subscription"? Price? Transferable?
- **Suggested default (adopted):** Admin generates; members redeem; e-pins are non-transferable (single redemption tied to the redeeming account).
- **Status:** 🔴 blocking for e-pin module build (`epin:generate` permission grant depends on this — see [rbac.md](rbac.md) §4).

### REQUIREMENT_DECISION_REQUIRED — Q-16: Subscription types
- **Unclear:** Exact meaning, price, benefits, renewal, and grace period for "yearly", "time-bound", and "lifetime" plans.
- **Recommended implementation:** `subscription_plans` schema supports all three types with configurable `duration_days` (null for lifetime); no real prices seeded until confirmed.
- **Status:** 🟡.

### REQUIREMENT_DECISION_REQUIRED — Q-17: Subscription mandatoriness
- **Unclear:** Is a subscription required to become a member, to sell as a vendor, or to earn commission?
- **Status:** 🟡 — affects `commission_rules.eligibility_predicate` (Q-04) and vendor-approval flow.

## D. Tax, invoicing, platform fees

### REQUIREMENT_DECISION_REQUIRED — Q-18: TDS rules ⚠️ requires client's CA
- **Unclear:** Section, rate, threshold, no-PAN rate, deduction point (credit vs. payout), report format/period.
- **Recommended implementation:** `tds_rules` fully versioned/configurable; **no rate is entered until the client's CA confirms it in writing** — this is explicit in the Live Testing doc's own go-live checklist.
- **Status:** 🔴 blocking for go-live (not for schema/build).

### REQUIREMENT_DECISION_REQUIRED — Q-19: GST & invoicing ⚠️ requires client's CA
- **Unclear:** Does each vendor issue their own invoice, or does the platform? Rates/HSN codes per category? Is vendor GSTIN mandatory? Is GST charged on the platform fee?
- **Suggested default (adopted):** Invoice per vendor, carrying the vendor's GSTIN when present; GST added on top of the listed price.
- **Status:** 🔴 blocking for go-live; invoice generation module can be built against the default and adjusted.

### REQUIREMENT_DECISION_REQUIRED — Q-20: Platform fee & vendor settlement
- **Unclear:** Platform fee rate charged to vendors; settled to vendor wallet or direct bank transfer?
- **Suggested default (adopted):** Vendor proceeds credited to the vendor's wallet after the return window (same mechanism as commission release, Q-06); rate itself TBD.
- **Status:** 🟡.

## E. Marketplace, orders, bidding

### REQUIREMENT_DECISION_REQUIRED — Q-21: Product fields & fulfillment scope
- **Unclear:** Stock count, variants, SKU, weight/shipping fields; is courier/delivery integration in scope for Phase 1; return policy.
- **Suggested default (adopted):** Basic fields + stock count; no courier integration in Phase 1.
- **Status:** 🟢.

### REQUIREMENT_DECISION_REQUIRED — Q-22: Listing approval scope
- **Unclear:** Does every product/service/project need admin approval, or only projects?
- **Suggested default (adopted):** Approval required for all three listing types, switchable per type via `system_settings`.
- **Status:** 🟢 default adopted.

### REQUIREMENT_DECISION_REQUIRED — Q-23: Project payment/completion flow
- **Unclear:** Advance + balance vs. milestones/escrow; who marks complete; cancellation/dispute rules.
- **Suggested default (adopted):** Advance at booking, balance before completion; vendor marks delivered, customer confirms completion. `project_milestones` schema present but inactive until milestone/escrow is confirmed.
- **Status:** 🟡.

### REQUIREMENT_DECISION_REQUIRED — Q-24: Service order flow
- **Unclear:** Fixed price or quote-based; scheduling; completion confirmation.
- **Suggested default (adopted):** Fixed price, same completion flow as projects minus milestones.
- **Status:** 🟢.

### REQUIREMENT_DECISION_REQUIRED — Q-25: Bidding payment settlement
- **Unclear:** How an accepted bid becomes a paid, fulfilled order — not defined in the client's original notes.
- **Recommended implementation:** Bidding is built (requirement post → sealed vendor bids → poster accepts one) per the already-live demo, but **payment for an accepted bid is intentionally unplugged** — architecture hands an accepted bid to the standard `orders`/`payments` pipeline once a rule is confirmed, rather than building a second, parallel payment path. See [architecture.md](architecture.md) §3 (`bidding` module).
- **Status:** 🔴 blocking for a complete bidding→payment flow; the posting/bidding UI itself can ship without it.

### REQUIREMENT_DECISION_REQUIRED — Q-26: Order status set & transition ownership
- **Unclear:** Exact status list and who may change each one.
- **Suggested default (adopted):** `PLACED, PAID, PROCESSING, SHIPPED/DELIVERED, COMPLETED, CANCELLED, REFUNDED`, enforced via the state-machine pattern in [architecture.md](architecture.md) §6. Transition permissions in [rbac.md](rbac.md) §4 (`order:update_status`, `order:cancel`).
- **Status:** 🟢 default adopted, schema/state-machine already designed for it.

### REQUIREMENT_DECISION_REQUIRED — Q-27: Multi-vendor cart/order model
- **Unclear:** One vendor or several per checkout? One order, or one per vendor?
- **Suggested default (adopted):** Multi-vendor cart, split into one order per vendor at checkout (`checkouts` → many `orders`). Already reflected in [database.md](database.md) §3.
- **Status:** 🟢 default adopted.

### REQUIREMENT_DECISION_REQUIRED — Q-28: Payment methods
- **Unclear:** UPI/cards/net banking via Razorpay only, or also cash-on-delivery?
- **Suggested default (adopted):** Razorpay online methods only in Phase 1.
- **Status:** 🟢.

## F. Roles, panels, messaging

### REQUIREMENT_DECISION_REQUIRED — Q-29: Super Admin scope (missing page 2 of client notes) 🔴
- **Unclear:** The client's handwritten notes have no dedicated Super Admin page (confirmed absent across the 5 photographed pages reviewed for this document); the feature list is undocumented from the client side.
- **Recommended implementation:** [rbac.md](rbac.md) uses the live demo's Super Admin scope as the working baseline: roles/permissions, platform settings, audit view, financial-rule configuration.
- **Status:** 🔴 blocking to finalize the Super Admin panel — **client must supply the missing page or confirm the demo's scope in writing.**

### REQUIREMENT_DECISION_REQUIRED — Q-30: Admin sub-roles & "vendor rights"
- **Unclear:** Are there admin sub-roles (finance/support/catalog)? What exactly is bundled into "vendor rights" the Admin assigns?
- **Suggested default (adopted):** Admin sub-roles implemented as `FINANCE`/`SUPPORT` (see [rbac.md](rbac.md)); "vendor rights" = the `VENDOR` role's permission bundle, editable per-vendor via explicit grant if ever needed.
- **Status:** 🟡 default adopted structurally; exact permission boundaries to confirm.

### REQUIREMENT_DECISION_REQUIRED — Q-31: Vendor onboarding
- **Unclear:** Self-signup vs. admin-created; approval/KYC required; which profile fields; what "New Registration" in the admin panel actually registers.
- **Suggested default (adopted):** Any member applies to become a vendor; admin approves (`vendor_profiles.approval_status`). Already encoded in [database.md](database.md) §1 and [rbac.md](rbac.md).
- **Status:** 🟢 default adopted.

### REQUIREMENT_DECISION_REQUIRED — Q-32: Member ID format & login
- **Unclear:** Format of Member ID; can members log in with it directly?
- **Suggested default (adopted):** Login by email or mobile number only; Member ID is a display identifier, not a credential.
- **Status:** 🟢 default adopted.

### REQUIREMENT_DECISION_REQUIRED — Q-33: Login method & verification requirements
- **Unclear:** Password, OTP, or both? Mandatory mobile verification at sign-up? Is WhatsApp code for sign-up only, or also login?
- **Suggested default (adopted):** Password login; email verification required at sign-up; mobile verification required before payouts specifically (not necessarily at sign-up).
- **Status:** 🟡.

### REQUIREMENT_DECISION_REQUIRED — Q-34: Undefined demo features
- **Unclear:** "Members Security Codes", "Advertisement", "SMS Inbox/Outbox/Draft/Upload Doc", "Dashboard like-tab", "Bell icon SMS" — none explained in the client's original notes.
- **Suggested default (adopted, as already demo'd):** Security code = optional 6-digit payout code (same as Q-13's wallet PIN); Advertisement = admin-managed home-page banners; SMS outbox = a read-only delivery log (not a full inbox/compose feature, since Phase 1 sends system-triggered SMS only, not member-composed SMS).
- **Status:** 🟢 defaults adopted from the demo, pending client confirmation.

### REQUIREMENT_DECISION_REQUIRED — Q-35: Messaging scope & feedback collection
- **Unclear:** Internal messaging — admin↔vendor only, or admin↔customer too? How is "Customer Feedback" collected?
- **Suggested default (adopted):** Admin to any member (broader than the original notes' "vendor only"); a feedback form in the member panel feeding `feedback`/`feedback:read`.
- **Status:** 🟢 default adopted.

### REQUIREMENT_DECISION_REQUIRED — Q-36: Blog authorship
- **Unclear:** Who writes posts; is there a public listing?
- **Suggested default (adopted):** Admin-authored only in Phase 1.
- **Status:** 🟢 default adopted.

### REQUIREMENT_DECISION_REQUIRED — Q-37: Idle logout, birthday channel, welcome-letter format
- **Suggested default (adopted):** 30-minute idle logout; birthday greeting via email; welcome letter as email + in-app copy.
- **Status:** 🟢 defaults adopted.

## G. Legal, KYC, data protection

### REQUIREMENT_DECISION_REQUIRED — Q-38: Mandatory KYC documents
- **Unclear:** PAN/bank/Aadhaar mandatoriness; manual admin check vs. automated verification service.
- **Suggested default (adopted):** PAN + bank details, checked manually by admin; **Aadhaar numbers are not stored.**
- **Status:** 🟡 default adopted; see [security.md §7](security.md#7-sensitive-data-handling-kyc--pii).

### REQUIREMENT_DECISION_REQUIRED — Q-39: Legal review of the referral/commission/wallet model 🔴 highest priority
- **Unclear:** Has the client obtained legal advice on direct-selling rules, money-circulation-scheme risk, RBI wallet-instrument rules, and Razorpay merchant-acceptance implications? Which legal entity is the actual merchant of record?
- **Why it matters:** This can change the business model itself, or block Razorpay merchant approval outright — it is upstream of nearly every other financial decision in this document (especially Q-10, Q-14).
- **Recommended implementation:** A full legal review is a **precondition** for enabling real money movement in production. Architecture/schema proceeds on the assumption of a standard referral-commission e-commerce model (no deposit-taking, no guaranteed-return promises) unless the review says otherwise.
- **Status:** 🔴 blocking for production go-live — not blocking for Phase 1 build (build proceeds against the documented defaults; production cutover is gated on this).

### REQUIREMENT_DECISION_REQUIRED — Q-40: Data retention & deletion (DPDP Act)
- **Unclear:** How long financial records must be kept; how user-deletion requests are handled.
- **Suggested default (adopted):** Retain financial records for the statutory period; anonymize personal data on a deletion request while preserving the financial ledger's integrity (ledger rows are never deleted, per [database.md's money model](database.md#money-model) — deletion requests anonymize the *person*, not the transaction history).
- **Status:** 🟡.

## H. Business & operations

### REQUIREMENT_DECISION_REQUIRED — Q-41: Technology stack change approval
- **Unclear:** Client's original notes specify .NET Core Web API / MS-SQL / IIS / iTextSharp / MSGraph (`Page 5.jpeg`); the proposal and live demo use Next.js/PostgreSQL/cloud hosting instead. Formal written approval of this change is still open per the client's own document.
- **Status:** 🔴 blocking, contractual — this document (and this entire architecture) assumes the Next.js/Postgres stack is approved, since both the Proposal and the live demo already use it, but the client's formal sign-off is outstanding. See [architecture.md §8](architecture.md#8-open-architectural-conflicts-found-in-the-source-documents).

### REQUIREMENT_DECISION_REQUIRED — Q-42: Third-party account ownership & payment
- **Suggested default (adopted):** Client pays for and owns every third-party account (Supabase, Razorpay, MSG91, Resend, Vercel); the dev team assists with setup. See [deployment.md](deployment.md) and [environment.md](environment.md).
- **Status:** 🟡ops item, not architectural.

### REQUIREMENT_DECISION_REQUIRED — Q-43: Slow third-party registrations
- **Unclear:** Status of SMS DLT registration, WhatsApp Business verification with Meta, Razorpay KYC.
- **Status:** 🔴 blocking for production go-live specifically (not for build) — these have multi-week lead times and gate OTP/payments.

### REQUIREMENT_DECISION_REQUIRED — Q-44: Timeline & "basic" scope definition
- **Unclear:** What exactly counts as "basic" bidding/tracking/blog/reports for Phase 1.
- **Status:** 🟡 — to be frozen in writing per the client's own six-phase production plan (Live Testing doc §14).

### REQUIREMENT_DECISION_REQUIRED — Q-46: Scale planning
- **Suggested default (adopted):** Plan capacity for ~10,000 users, ~1,000 orders/day in year 1; English-only UI (no i18n scaffolding required for Phase 1).
- **Status:** 🟢 default adopted — informs indexing/pagination choices already reflected in [database.md](database.md)/[api.md](api.md), not a blocker.

### REQUIREMENT_DECISION_REQUIRED — Q-48: Support contact
- **Suggested default (adopted):** Single shared support email/phone shown platform-wide.
- **Status:** 🟢 content item, not architectural.

---

## Items not built at all, pending decision (carried verbatim from the client's own status list)

| Item | Why it's not built | What's needed |
|---|---|---|
| Investment income / withdrawn-balance reports (Q-14) | Possible deposit/return-rule legal exposure | Client explanation + lawyer's written view |
| Member-to-member wallet transfers (Q-10) | Possible RBI prepaid-instrument approval requirement | Legal-advised decision |
| Member-generated e-pins (Q-15) | Moves money; rules undefined | Rules for who may create them and at what price |
| Automatic (rule-triggered) rewards (Q-08) | Triggers/types undefined | Trigger, type, and expiry rules |
| Payment for an accepted bid (Q-25) | Undefined in original notes | How bid orders are paid |
| Full SMS inbox/compose/drafts (Q-34) | Needs a real SMS provider connected first, and scope confirmation | Confirmation this feature (vs. a read-only log) is wanted |
| Payment-gateway-initiated refunds | Refunds are recorded in the ledger; gateway call-out is a Phase 4-equivalent (production-build) task, not a Phase 0/1 gap | No client input needed — scheduled, not blocked |
| Member two-step login (Q-33 follow-on) | Kept admin-only for now | Confirm if members need it too |
| Server-generated invoice PDFs vs. printable HTML | Live demo uses browser-print; this build's ADR ([0007](adr/0007-pdf-generation.md)) proposes server-side generation by default | Confirm if server PDF generation is required for Phase 1 or can follow later |

## Architectural (non-business) decisions requiring confirmation

These are tracked as ADRs, not Q-numbers, but are equally REQUIREMENT_DECISION_REQUIRED-flagged conflicts found across the source documents:

- Hosting topology conflict (Vercel+Supabase vs. Vercel+Render) — [ADR-0004](adr/0004-hosting-topology.md).
- ORM choice (Prisma vs. Drizzle) — [ADR-0001](adr/0001-orm-choice.md), decided, documented for the record rather than left open.
