# Just Reference — Complete Module Breakdown (Phase 0)

Expands [architecture.md §3](architecture.md#3-module-boundaries-bounded-contexts). One module = one bounded context = one folder under `src/server/domain/*` = one section of `prisma/schema.prisma`. A module's repository is the only code that queries its own tables directly.

For each module: purpose, owned tables, permissions it exposes, events it emits/consumes, and what it explicitly does **not** own (to keep boundaries legible).

---

### 1. `identity`
- **Purpose:** Accounts, authentication, roles/permissions, sessions, OTP verification, KYC-adjacent identity fields.
- **Owns:** `users`, `member_profiles`, `addresses`, `bank_accounts`, `vendor_profiles`, `roles`, `permissions`, `role_permissions`, `user_roles`, `otp_verifications`.
- **Permissions exposed:** `user:*`, `role:*`, `permission:*`, `vendor:apply/approve/reject/suspend`.
- **Emits:** `UserRegistered`, `VendorApproved`, `MemberBlocked`.
- **Consumes:** nothing (foundational module).
- **Does not own:** wallet balance, referral relationships (it owns the `member_id`/`referral_code` identifiers referenced by `referral`, not the relationships themselves).

### 2. `catalog`
- **Purpose:** Product/service/project listings and their taxonomy.
- **Owns:** `product_categories`, `product_subcategories`, `products`, `product_images`, `service_categories`, `service_subcategories`, `services`, `service_images`, `project_categories`, `project_subcategories`, `projects`, `project_images`, `project_documents`, `project_milestones`.
- **Permissions exposed:** `product:*`, `service:*`, `project:*`, `category:manage`.
- **Emits:** `ListingApproved`, `ListingRejected`.
- **Consumes:** `identity` (vendor ownership + approval status).
- **Does not own:** pricing at order time (order-time price is a **snapshot** taken by `orders`, not a live read of `catalog` — see [database.md §3](database.md#3-cart-orders-checkout)).

### 3. `cart-checkout`
- **Purpose:** Pre-order shopping state and the checkout act that splits a multi-vendor cart into vendor orders.
- **Owns:** `carts`, `cart_items`, `checkouts`.
- **Permissions exposed:** `cart:manage`.
- **Emits:** `CheckoutStarted`.
- **Consumes:** `catalog` (current price/availability at add-to-cart and at checkout confirmation), `coupon-reward` (coupon validation).
- **Does not own:** the resulting `orders` rows — checkout hands off to `orders` and ends its own responsibility there.

### 4. `orders`
- **Purpose:** Order lifecycle, per-vendor order groups, status state machine, order-level tracking.
- **Owns:** `orders`, `order_items`, `order_vendor_groups`, `order_status_history`.
- **Permissions exposed:** `order:*`.
- **Emits:** `OrderPlaced`, `OrderPaid` (relayed from `payments`), `OrderCompleted`, `OrderCancelled`, `OrderRefunded`.
- **Consumes:** `payments` (payment confirmation drives `PLACED -> PAID`).
- **Does not own:** wallet or commission tables — it only emits events; `commission` and `wallet` react, `orders` never writes to them directly (see [architecture.md §2](architecture.md#2-layering-rule-mandatory)).

### 5. `payments`
- **Purpose:** Razorpay integration, signature verification, webhook ingestion, idempotency.
- **Owns:** `payments`, `payment_events`, `payment_transactions`.
- **Permissions exposed:** `payment:read`, `payment:webhook_process` (system-role only).
- **Emits:** `PaymentConfirmed`, `PaymentFailed`, `RefundProcessed`.
- **Consumes:** nothing internal (talks to Razorpay externally).
- **Does not own:** what happens *because* a payment succeeded (order status, commission, wallet) — those are downstream reactions in other modules.

### 6. `invoicing`
- **Purpose:** GST-compliant invoice generation and PDF rendering.
- **Owns:** `invoices`, `invoice_items`.
- **Permissions exposed:** `invoice:read`, `invoice:generate`.
- **Consumes:** `orders` (read-only snapshot at invoice time — never recalculates from live catalog prices).
- **Does not own:** GST/TDS *rule* configuration (that's `tds-tax`); it applies the active rule version at invoice time.

### 7. `referral`
- **Purpose:** Referral relationships and the `ltree`-based tree projection.
- **Owns:** `referral_relationships` (plus the `member_profiles.referral_path` column it maintains).
- **Permissions exposed:** `referral:*`.
- **Emits:** `ReferralCreated`, `ReferralRepointed`.
- **Consumes:** `identity`.
- **Does not own:** commission calculation — it exposes ancestor/descendant queries; `commission` decides who gets paid how much.

### 8. `commission`
- **Purpose:** Configurable commission rules and the immutable commission ledger.
- **Owns:** `commission_rules`, `commission_ledger`.
- **Permissions exposed:** `commission:*`, `commission_rule:*`.
- **Emits:** `CommissionCreated`, `CommissionReleased`, `CommissionReversed`.
- **Consumes:** `orders` (`OrderCompleted`/`OrderRefunded`), `referral` (ancestor lookup), `identity` (eligibility — active subscription check).
- **Does not own:** the wallet credit itself — it emits `CommissionReleased`; `wallet` performs the actual balance-affecting write. This split is deliberate (see [financial-ledger.md](financial-ledger.md)) so commission logic never has wallet-locking concerns and vice versa.

### 9. `wallet`
- **Purpose:** The single point of truth for balance-affecting writes across the whole platform.
- **Owns:** `wallets`, `wallet_transactions`.
- **Permissions exposed:** `wallet:*`, `wallet_pin:set`.
- **Emits:** `WalletCredited`, `WalletDebited`.
- **Consumes:** `commission` (`CommissionReleased`), `payout` (debit on approval), `payments` (top-up credit), `coupon-reward` (reward credit).
- **Does not own:** *why* money moves — every caller supplies a `reference_type`/`reference_id`; `wallet` only guarantees the invariant (no negative balance, ledger-first, idempotent).

### 10. `payout`
- **Purpose:** Payout request/approval workflow and the manual bank-transfer record.
- **Owns:** `payout_requests`, `payout_transactions`.
- **Permissions exposed:** `payout:*`.
- **Emits:** `PayoutApproved`, `PayoutRejected`, `PayoutPaid`.
- **Consumes:** `wallet` (balance check + debit), `identity` (verified-bank-account check).
- **Does not own:** TDS calculation on the payout — it calls `tds-tax` for the deduction amount before finalizing the transfer amount.

### 11. `epin-subscription`
- **Purpose:** E-pin lifecycle and subscription plan/entitlement management.
- **Owns:** `subscription_plans`, `subscriptions`, `epins`, `epin_redemptions`.
- **Permissions exposed:** `epin:*`, `subscription_plan:manage`, `subscription:read`.
- **Emits:** `EpinRedeemed`, `SubscriptionActivated`, `SubscriptionExpired`.
- **Consumes:** `payments` (e-pin purchase), `identity` (who redeemed).
- **Does not own:** commission eligibility rules themselves — it exposes "is this member's subscription active" as a query `commission` calls.

### 12. `coupon-reward`
- **Purpose:** Discount coupons and manually-granted rewards.
- **Owns:** `coupons`, `coupon_redemptions`, `rewards`, `reward_transactions`.
- **Permissions exposed:** `coupon:*`, `reward:*`.
- **Consumes:** `cart-checkout` (validation at checkout), `wallet` (cash-reward credit).

### 13. `tds-tax`
- **Purpose:** Versioned TDS/GST rules and the resulting tax ledger/reports.
- **Owns:** `tds_rules`, `tds_transactions`, `tds_reports`.
- **Permissions exposed:** `tds_rule:manage`, `gst_rule:manage`, `tds:*`, `tds_report:export`.
- **Consumes:** `commission` (`CommissionReleased`), `payout` (`PayoutApproved`).
- **Does not own:** GST on the invoice line items directly — `invoicing` applies the active GST rule at invoice time by calling this module.

### 14. `bidding`
- **Purpose:** Requirement posting and sealed-bid workflow; payment handoff intentionally left open (Q-25).
- **Owns:** `bidding_requirements`, `bids`.
- **Permissions exposed:** `requirement:*`, `bid:*`.
- **Emits:** `BidAccepted` — designed to be consumed by `cart-checkout`/`orders` once a payment rule is confirmed, not by a bidding-specific payment path.

### 15. `messaging-support`
- **Purpose:** Internal messaging, support tickets, notification fan-out.
- **Owns:** `internal_messages`, `support_tickets`, `support_messages`, `notifications`, `feedback`.
- **Permissions exposed:** `message:*`, `ticket:*`, `notification:read`, `feedback:*`.
- **Consumes:** events from every other module that should surface a notification (order status change, payout approved, commission released, ticket response) — see [notifications.md](notifications.md).

### 16. `admin-ops`
- **Purpose:** Cross-cutting admin actions that don't belong to a single domain: member moderation, blog, banners, settings, maintenance mode.
- **Owns:** `blogs`, `blog_posts`, `advertisements`, `banners`, `system_settings`, `maintenance_settings`.
- **Permissions exposed:** `member:block/unblock/filter_list`, `blog:*`, `banner:manage`, `settings:*`, `maintenance:toggle`.
- **Consumes:** `identity` (member records).

### 17. `audit`
- **Purpose:** Immutable, platform-wide audit trail.
- **Owns:** `audit_logs`.
- **Exposes:** one function, `audit.record(entry)`, called by every other module for its sensitive operations (see [audit-logging.md](audit-logging.md)) — never queried/written any other way.
- **Permissions exposed:** `audit:read`.

### 18. `platform-integrations` *(cross-cutting, not a bounded context with its own tables)*
- **Purpose:** Provider adapters — `SmsProvider` (MSG91/Twilio), `WhatsAppProvider`, `EmailProvider` (Resend/Supabase SMTP), `PaymentProvider` (Razorpay), `StorageProvider` (Supabase Storage). Lives in `src/server/lib/*`, not `src/server/domain/*`, because it has no business rules of its own — only I/O adapters that domain modules call through an interface, so the concrete vendor is swappable (per the brief's "MSG91 or Twilio" phrasing).
- **Owns:** `webhook_events` (cross-provider idempotency ledger), `files`/`documents` (generic attachment registry used by multiple modules).

---

## Module dependency direction (enforced, not just documented)

```
identity  <──  everything (foundational)
catalog   <──  cart-checkout, orders (read-only snapshot)
orders    <──  payments (status), commission (events), invoicing (snapshot read)
payments  <──  orders (initiates), epin-subscription (initiates)
referral  <──  commission (ancestor lookup)
commission ──> wallet (event only, never direct write)
payout    ──> wallet (debit), tds-tax (deduction calc)
* every module ──> audit (write-only, one function call)
* every module ──> messaging-support (event, for notification fan-out)
```

A dependency arrow only ever points **one direction** between any two modules — e.g. `commission` knows about `wallet`'s event contract, but `wallet` has no import of `commission`'s internals, only a generic `credit(walletId, amount, referenceType, referenceId)` call. This is what keeps "referral logic isolated from order logic" and "wallet logic isolated from payment UI" (the brief's explicit requirement) true in code, not just in prose.
