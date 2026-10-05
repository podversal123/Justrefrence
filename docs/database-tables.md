# Just Reference — Database Table Specification (Phase 0)

Column-level companion to [database.md](database.md) (which covers the ERD, referral-tree model, and money model at the conceptual level) and [relationships.md](relationships.md) (which lists every FK as a standalone cardinality table). This is the per-table reference for Phase 1 schema authoring.

## Global conventions (apply to every table unless a table explicitly overrides one)

- `id uuid PRIMARY KEY DEFAULT gen_random_uuid()` unless noted otherwise (e.g. `users.id` mirrors `auth.users.id`).
- `created_at timestamptz NOT NULL DEFAULT now()`, `updated_at timestamptz NOT NULL DEFAULT now()` (maintained by a trigger or Prisma `@updatedAt`).
- `deleted_at timestamptz NULL` is added **only** on tables marked "Soft delete: Yes" below.
- Money columns are `bigint` (integer paise) + `currency char(3) NOT NULL DEFAULT 'INR'` — see [ADR-0002](adr/0002-money-representation.md).
- Status/enum-like columns are `text` + a `CHECK` constraint listing allowed values (not a native Postgres `enum`), so new values can be added by migration without a type-alter.
- "Audit: Yes" means the operation is written to `audit_logs` via `audit.record()` (see [audit-logging.md](audit-logging.md)) in addition to whatever the table itself records — it is not a substitute for the table's own history.
- Ledger-pattern tables (marked "insert-only") have `UPDATE`/`DELETE` **revoked** from the application's runtime DB role — corrections are new rows, never edits. See [financial-ledger.md](financial-ledger.md).

---

## 1. Identity & access

### `users`
Purpose: authentication identity — one row per account, `id` shared with Supabase `auth.users.id`.

| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK, = `auth.users.id` |
| email | text | NO | |
| phone | text | YES | |
| status | text | NO | `CHECK IN ('ACTIVE','BLOCKED','PENDING_VERIFICATION')`, default `PENDING_VERIFICATION` |
| email_verified_at | timestamptz | YES | |
| phone_verified_at | timestamptz | YES | |
| failed_login_attempts | int | NO | default `0` — **Phase 4 addition**, account-lock protection, shared by email/password and mobile-OTP login, see `src/server/domain/identity/account-lock.ts` |
| locked_until | timestamptz | YES | **Phase 4 addition**, same reason |

**PK:** id · **FK:** none · **Unique:** `email`, `phone` · **Indexes:** `status` · **Soft delete:** No — accounts are deactivated via `status='BLOCKED'`, never deleted, since financial history must survive · **Audit:** Yes — status changes, email/phone changes.

### `member_profiles`
Purpose: the business "member" identity — every user gets exactly one.

| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| user_id | uuid | NO | FK → `users.id` |
| member_seq | bigint | NO | DB-assigned autoincrement backing `member_id` — see Phase 4 note below |
| member_id | text | YES until assigned | public display code, e.g. `JR-000482` |
| referral_code | text | YES until assigned | public, defaults to `member_id` |
| referral_path | text | NO | see Phase 4 note below and [ADR-0003](adr/0003-referral-tree-model.md) |
| referred_by_user_id | uuid | YES | FK → `users.id` |
| dob | date | YES | |
| pan | text | YES | masked at API boundary, see [security.md](security.md) §7 |
| gstin | text | YES | |
| website_url | text | YES | Phase 4 addition — not in the original brief's table list, added for the "Website/social links" profile field |
| social_links | jsonb | YES | Phase 4 addition, same reason as `website_url` |
| kyc_status | text | NO | `CHECK IN ('PENDING','VERIFIED','REJECTED')`, default `PENDING` |

**PK:** id · **FK:** `user_id → users.id`, `referred_by_user_id → users.id` · **Unique:** `user_id`, `member_seq`, `member_id`, `referral_code` · **Indexes:** btree on `referred_by_user_id` (GiST on `referral_path` once it migrates to native `ltree` — see note) · **Soft delete:** No · **Audit:** Yes — KYC status changes.

**Phase 4 implementation note:** `member_id`/`referral_code` are assigned in a second write right after insert (the DB-assigned `member_seq` isn't known until the row exists — see `src/server/repositories/identity/member-repository.ts`), hence nullable in the type above even though every row has them within the same transaction. `referral_path` is a plain `text` column today (hyphen-stripped member-id segments, dot-separated — already in valid `ltree` label format) rather than native `ltree`; the migration to the real `ltree` type + GiST index is deferred to the phase that actually needs tree-traversal queries (commission fan-out), per the schema comment on `MemberProfile`.

### `addresses`
Purpose: residence/office/billing addresses, many per user.

| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| owner_user_id | uuid | NO | FK → `users.id` |
| type | text | NO | `CHECK IN ('RESIDENCE','OFFICE','BILLING')` |
| line1 | text | NO | |
| line2 | text | YES | |
| city | text | NO | |
| state | text | NO | |
| postal_code | text | NO | |
| country | text | NO | default `'IN'` |
| is_default | boolean | NO | default `false` |

**PK:** id · **FK:** `owner_user_id → users.id` · **Unique:** none · **Indexes:** `owner_user_id` · **Soft delete:** Yes — user-initiated removal · **Audit:** No (routine profile data, low sensitivity).

### `bank_accounts`
Purpose: payout bank details.

| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| user_id | uuid | NO | FK → `users.id` |
| account_holder_name | text | NO | |
| account_no_encrypted | bytea | NO | app-layer AES-GCM, see [security.md](security.md) §6 |
| account_no_masked | text | NO | e.g. `******1234` |
| ifsc | text | NO | |
| branch_address | text | YES | |
| verified_at | timestamptz | YES | |
| verified_by | uuid | YES | FK → `users.id` |

**PK:** id · **FK:** `user_id → users.id`, `verified_by → users.id` · **Unique:** `(user_id, account_no_masked)` · **Indexes:** `user_id` · **Soft delete:** Yes · **Audit:** Yes — sensitive financial PII, every add/verify/remove logged.

### `vendor_profiles`
Purpose: vendor capability layered onto a member (1:0..1) — see [ADR](database.md#1-identity--access) note on vendor being an upgrade, not a separate signup.

| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| member_profile_id | uuid | NO | FK → `member_profiles.id` |
| business_name | text | NO | |
| approval_status | text | NO | `CHECK IN ('PENDING','APPROVED','REJECTED','SUSPENDED')`, default `PENDING` |
| approved_by | uuid | YES | FK → `users.id` |
| approved_at | timestamptz | YES | |

**PK:** id · **FK:** `member_profile_id → member_profiles.id`, `approved_by → users.id` · **Unique:** `member_profile_id` · **Indexes:** `approval_status` · **Soft delete:** No (status covers deactivation) · **Audit:** Yes — approval/rejection/suspension.

### `roles`
Purpose: static role catalog (seed data).

| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| code | text | NO | `SUPER_ADMIN` / `ADMIN` / `FINANCE` / `SUPPORT` / `VENDOR` / `CUSTOMER` |
| label | text | NO | |

**PK:** id · **Unique:** `code` · **Soft delete:** No · **Audit:** Yes (rare, security-relevant edits).

### `permissions`
Purpose: static permission catalog (seed data), see [rbac.md](rbac.md) §3.

| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| code | text | NO | e.g. `wallet:withdraw` |
| description | text | NO | |

**PK:** id · **Unique:** `code` · **Soft delete:** No · **Audit:** Yes.

### `role_permissions`
Purpose: default permission bundle per role.

| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| role_id | uuid | NO | FK → `roles.id` |
| permission_id | uuid | NO | FK → `permissions.id` |

**PK:** id · **FK:** `role_id`, `permission_id` · **Unique:** `(role_id, permission_id)` · **Indexes:** both FK columns · **Soft delete:** No · **Audit:** Yes — every change is security-critical (Q-30).

### `user_roles`
Purpose: which roles a user actually holds — many-to-many, supports `CUSTOMER` + `VENDOR` on one account.

| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| user_id | uuid | NO | FK → `users.id` |
| role_id | uuid | NO | FK → `roles.id` |
| granted_by | uuid | YES | FK → `users.id` |
| granted_at | timestamptz | NO | default `now()` |
| revoked_by | uuid | YES | FK → `users.id` |
| revoked_at | timestamptz | YES | |

**PK:** id · **FK:** `user_id`, `role_id`, `granted_by`, `revoked_by` · **Unique:** `(user_id, role_id)` where `revoked_at IS NULL` (partial unique) · **Indexes:** `user_id`, `role_id` · **Soft delete:** No — has its own `revoked_at` lifecycle field instead of the generic `deleted_at` · **Audit:** Yes — every grant/revoke.

### `otp_verifications`
Purpose: OTP challenge records (email/mobile/WhatsApp).

| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| user_id | uuid | YES | FK → `users.id`, nullable pre-signup |
| channel | text | NO | `CHECK IN ('EMAIL','SMS','WHATSAPP')` |
| purpose | text | NO | `CHECK IN ('REGISTRATION','LOGIN')` — **Phase 4 addition**, not in the original table list: needed because `otp_verifications` is shared by registration (any channel) and mobile-OTP login (ADR-0012), and "the current active code for this user" must resolve per-intent, not just per-channel |
| destination_masked | text | NO | |
| code_hash | text | NO | raw OTP never stored, see [security.md](security.md) §2 |
| expires_at | timestamptz | NO | |
| consumed_at | timestamptz | YES | |
| attempt_count | int | NO | default `0` |

**PK:** id · **FK:** `user_id → users.id` · **Unique:** none · **Indexes:** `(destination_masked, channel, created_at)` for rate limiting, `user_id` · **Soft delete:** No — expires naturally, purged by a retention job, not soft-deleted · **Audit:** No dedicated `audit_logs` rows (volume) — failed attempts feed the login-protection rate limiter instead.

---

## 2. Catalog

### `product_categories`
Purpose: top-level product taxonomy.

| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| name | text | NO | |
| slug | text | NO | |

**Unique:** `slug` · **Soft delete:** Yes — removing a category must not cascade-delete historical products · **Audit:** Yes.

### `product_subcategories`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| category_id | uuid | NO | FK → `product_categories.id` |
| name | text | NO | |
| slug | text | NO | |

**Unique:** `(category_id, slug)` · **Indexes:** `category_id` · **Soft delete:** Yes · **Audit:** Yes.

### `products`
Purpose: vendor product listings.

| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| vendor_id | uuid | NO | FK → `vendor_profiles.id` |
| category_id | uuid | NO | FK → `product_categories.id` |
| subcategory_id | uuid | YES | FK → `product_subcategories.id` |
| title | text | NO | |
| slug | text | NO | |
| description | text | YES | |
| sku | text | NO | |
| price | bigint | NO | paise, `CHECK >= 0` |
| currency | char(3) | NO | default `'INR'` |
| stock | int | NO | default `0`, `CHECK >= 0` |
| status | text | NO | `CHECK IN ('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED','ARCHIVED')`, default `DRAFT` |
| approved_by | uuid | YES | FK → `users.id` |
| approved_at | timestamptz | YES | |

**FK:** `vendor_id`, `category_id`, `subcategory_id`, `approved_by` · **Unique:** `slug`, `(vendor_id, sku)` · **Indexes:** `vendor_id`, `category_id`, `status` · **Soft delete:** Yes · **Audit:** Yes — approval/rejection, price changes.

### `product_images`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| product_id | uuid | NO | FK → `products.id` |
| storage_path | text | NO | |
| sort_order | int | NO | default `0` |

**Indexes:** `product_id` · **Soft delete:** No — media rows are hard-deleted on removal, no financial reference · **Audit:** No.

### `service_categories`, `service_subcategories`
Mirror `product_categories`/`product_subcategories` exactly, scoped to services. Same constraints, soft-delete and audit rules.

### `services`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| vendor_id | uuid | NO | FK → `vendor_profiles.id` |
| category_id | uuid | NO | FK → `service_categories.id` |
| subcategory_id | uuid | YES | FK → `service_subcategories.id` |
| title | text | NO | |
| slug | text | NO | |
| description | text | YES | |
| pricing_type | text | NO | `CHECK IN ('FIXED','QUOTE')` — Q-24 |
| price | bigint | YES | null when `pricing_type='QUOTE'` |
| currency | char(3) | NO | default `'INR'` |
| availability | jsonb | YES | scheduling info |
| status | text | NO | same enum as `products.status` |
| approved_by | uuid | YES | FK → `users.id` |
| approved_at | timestamptz | YES | |

**Unique:** `slug` · **Indexes:** `vendor_id`, `category_id`, `status` · **Soft delete:** Yes · **Audit:** Yes.

### `service_images`
Mirrors `product_images`, `service_id` FK. Soft delete: No · Audit: No.

### `project_categories`, `project_subcategories`
Mirror `product_categories`/`product_subcategories`, scoped to projects.

### `projects`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| vendor_id | uuid | NO | FK → `vendor_profiles.id` |
| category_id | uuid | NO | FK → `project_categories.id` |
| subcategory_id | uuid | YES | FK → `project_subcategories.id` |
| title | text | NO | |
| slug | text | NO | |
| description | text | YES | |
| cost | bigint | NO | paise |
| payment_mode | text | NO | `CHECK IN ('ADVANCE_BALANCE','FULL')` — Q-23 |
| advance_amount | bigint | NO | default `0` |
| balance_amount | bigint | NO | default `0`, `CHECK (advance_amount + balance_amount = cost)` |
| terms | text | YES | |
| status | text | NO | `CHECK IN ('CREATED','APPROVED','BOOKED','ADVANCE_PAID','IN_PROGRESS','DELIVERED','COMPLETED','CANCELLED')`, default `CREATED` |
| approved_by | uuid | YES | FK → `users.id` |
| approved_at | timestamptz | YES | |

**Unique:** `slug` · **Indexes:** `vendor_id`, `status` · **Soft delete:** Yes · **Audit:** Yes — approval, every status change.

### `project_images`
Mirrors `product_images`, `project_id` FK. Soft delete: No · Audit: No.

### `project_documents`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| project_id | uuid | NO | FK → `projects.id` |
| storage_path | text | NO | |
| doc_type | text | YES | |
| uploaded_by | uuid | NO | FK → `users.id` |

**Indexes:** `project_id` · **Soft delete:** Yes · **Audit:** Yes — contract-adjacent documents.

### `project_milestones`
*(schema present, inactive in UI until Q-23 confirms milestones/escrow are in scope)*

| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| project_id | uuid | NO | FK → `projects.id` |
| title | text | NO | |
| amount | bigint | NO | |
| due_date | date | YES | |
| status | text | NO | `CHECK IN ('PENDING','COMPLETED')`, default `PENDING` |
| sort_order | int | NO | default `0` |

**Indexes:** `project_id` · **Soft delete:** Yes · **Audit:** Yes.

---

## 3. Cart, orders, checkout

### `carts`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| owner_user_id | uuid | NO | FK → `users.id` |
| status | text | NO | `CHECK IN ('OPEN','CHECKED_OUT','ABANDONED')`, default `OPEN` |

**Unique:** `owner_user_id` WHERE `status='OPEN'` (partial unique — one open cart per user) · **Indexes:** `owner_user_id` · **Soft delete:** No (status covers lifecycle) · **Audit:** No (high-volume, pre-financial).

**Phase 5 implementation note:** the partial/filtered unique index above isn't expressible in Prisma's schema DSL (no live migration capability in this environment either), so "one open cart per user" is enforced at the application layer (`getOrCreateOpenCart()`, a find-or-create) rather than a DB constraint — see `src/server/repositories/commerce/cart-repository.ts`.

### `cart_items`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| cart_id | uuid | NO | FK → `carts.id` |
| item_type | text | NO | `CHECK IN ('PRODUCT','SERVICE','PROJECT')` |
| item_id | uuid | NO | app-level reference, see [database.md](database.md#3-cart-orders-checkout) polymorphism note |
| qty | int | NO | default `1`, `CHECK > 0` |

**Unique:** `(cart_id, item_type, item_id)` · **Indexes:** `cart_id` · **Soft delete:** No — row is deleted on remove-from-cart, no history needed pre-checkout · **Audit:** No.

### `checkouts`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| cart_id | uuid | NO | FK → `carts.id` |
| buyer_id | uuid | NO | FK → `users.id` |
| coupon_id | uuid | YES | FK → `coupons.id` |
| status | text | NO | `CHECK IN ('PENDING','COMPLETED','FAILED')`, default `PENDING` |
| idempotency_key | text | NO | **Phase 5 addition**, not in the original spec (see docs/adr/0013-commerce-money-math.md) — the anchor for idempotent order creation, since no `payments` row exists yet to key off |

**Unique:** `idempotency_key` · **Indexes:** `cart_id`, `buyer_id` · **Soft delete:** No · **Audit:** Yes — start of a financial event chain.

### `orders`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| checkout_id | uuid | NO | FK → `checkouts.id` |
| order_number | text | NO | |
| vendor_id | uuid | NO | FK → `vendor_profiles.id` |
| buyer_id | uuid | NO | FK → `users.id` |
| status | text | NO | `CHECK IN ('PLACED','PAID','PROCESSING','SHIPPED','DELIVERED','COMPLETED','CANCELLED','REFUNDED')`, default `PLACED` |
| subtotal | bigint | NO | |
| discount_total | bigint | NO | default `0` |
| tax_total | bigint | NO | default `0` |
| platform_fee_total | bigint | NO | default `0` |
| grand_total | bigint | NO | |
| currency | char(3) | NO | default `'INR'` |

**FK:** `checkout_id`, `vendor_id`, `buyer_id` · **Unique:** `order_number`, `(checkout_id, vendor_id)` (Phase 5: this pair's uniqueness is what replaces the separate `order_vendor_groups` table below — see docs/adr/0013) · **Indexes:** `buyer_id`, `vendor_id`, `status`, `checkout_id` · **Soft delete:** No — never delete an order, cancel via status · **Audit:** Yes — every status change (mirrors `order_status_history`).

### `order_items`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| order_id | uuid | NO | FK → `orders.id` |
| item_type | text | NO | `CHECK IN ('PRODUCT','SERVICE','PROJECT')` |
| item_id | uuid | NO | |
| title_snapshot | text | NO | |
| unit_price_snapshot | bigint | NO | |
| qty | int | NO | `CHECK > 0` |
| line_total | bigint | NO | |

**Indexes:** `order_id` · **Soft delete:** No · **Audit:** No — immutable snapshot, covered by the parent order's audit trail.

### `order_vendor_groups` — not implemented (Phase 5)
Superseded by `@@unique([checkout_id, vendor_id])` directly on `orders` (see above), which expresses the identical "one order per vendor per checkout" guarantee without a separate join table. See docs/adr/0013-commerce-money-math.md.

### `order_status_history`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| order_id | uuid | NO | FK → `orders.id` |
| from_status | text | YES | |
| to_status | text | NO | |
| actor_id | uuid | YES | FK → `users.id` |
| reason | text | YES | |

**Indexes:** `order_id` · **Soft delete:** No — append-only · **Audit:** This table **is** the primary audit trail for order status; also mirrored into `audit_logs` for cross-entity search.

---

## 4. Payments & invoicing

### `payments`
**Phase 8 implemented.** See docs/adr/0016-razorpay-payment-integration.md.

| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| checkout_id | uuid | YES | **Phase 8: renamed from `order_id`** — FK → `checkouts.id`, not `orders.id`. One Razorpay order covers every vendor-order split out of one checkout (Phase 5), so this is keyed to the checkout, not a single order — see ADR-0016. Nullable — also used for wallet top-up/e-pin/subscription purchase (purposes designed, not wired this phase) |
| payer_id | uuid | NO | FK → `users.id` |
| purpose | text | NO | `CHECK IN ('ORDER','WALLET_TOPUP','EPIN_PURCHASE','SUBSCRIPTION')` |
| provider | text | NO | default `'RAZORPAY'` |
| provider_order_id | text | NO | |
| provider_payment_id | text | YES | |
| amount | bigint | NO | |
| currency | char(3) | NO | default `'INR'` |
| status | text | NO | `CHECK IN ('CREATED','AUTHORIZED','CAPTURED','FAILED','REFUNDED')`, default `CREATED` |
| idempotency_key | text | NO | |

**Unique:** `idempotency_key` · **Indexes:** `checkout_id`, `payer_id`, `provider_order_id` · **Soft delete:** No · **Audit:** Yes — every status transition.

### `payment_events`
**Phase 8 implemented.** Purpose: raw webhook AND checkout-callback payloads (append-only, legal/financial evidence) — every signature check this system ever performed, valid or invalid, is inserted, never silently dropped.

| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| provider | text | NO | |
| event_id | text | NO | provider's own event ID |
| payment_id | uuid | YES | FK → `payments.id` |
| signature_valid | boolean | NO | |
| raw_payload | jsonb | NO | |
| processed_at | timestamptz | YES | |

**Unique:** `(provider, event_id)` · **Indexes:** `payment_id` · **Soft delete:** No, never deleted · **Audit:** Implicit (this table is itself audit evidence); processing also logged to `audit_logs`.

### `payment_transactions`
**Phase 8 implemented.**

| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| payment_id | uuid | NO | FK → `payments.id` |
| type | text | NO | `CHECK IN ('CAPTURE','REFUND')` |
| amount | bigint | NO | |
| provider_reference | text | YES | |

**Indexes:** `payment_id` · **Soft delete:** No · **Audit:** Yes.

### `invoices`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| order_id | uuid | NO | FK → `orders.id` |
| invoice_seq | bigint | NO | **Phase 5 addition** — DB-assigned autoincrement backing `invoice_number`; not reset per financial year, so numbering is collision-free but not true gapless-per-FY yet (see the schema comment on `Invoice.invoiceSeq`) |
| invoice_number | text | YES until assigned | sequential, intended gapless per financial year — Q-19; nullable for the same two-step-create reason as `orders.order_number` |
| financial_year | text | NO | e.g. `'2026-27'` |
| buyer_snapshot | jsonb | NO | |
| vendor_snapshot | jsonb | NO | |
| subtotal | bigint | NO | |
| gst_total | bigint | NO | |
| platform_fee | bigint | NO | default `0` |
| grand_total | bigint | NO | |
| pdf_storage_path | text | YES | |

**Unique:** `invoice_number`, `order_id` · **Indexes:** `financial_year` · **Soft delete:** No — statutory document, never deleted · **Audit:** Yes — generation event.

### `invoice_items`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| invoice_id | uuid | NO | FK → `invoices.id` |
| order_item_id | uuid | NO | FK → `order_items.id` |
| hsn_code | text | YES | |
| gst_rate_bps | int | NO | **Phase 5:** integer basis points (percent×100), not `numeric(5,2)` — see docs/adr/0013-commerce-money-math.md |
| gst_amount | bigint | NO | |
| line_total | bigint | NO | |

**Indexes:** `invoice_id` · **Soft delete:** No · **Audit:** No (covered by parent invoice).

---

## 5. Referral & commission

### `referral_relationships`
Purpose: authoritative direct-parent-of-record.

| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| member_id | uuid | NO | FK → `member_profiles.id` |
| referrer_id | uuid | NO | FK → `member_profiles.id` |
| level | int | NO | default `1` (direct parent link only; indirect levels are derived from `referral_path`, not stored redundantly here) |
| changed_by | uuid | YES | FK → `users.id`, `SUPER_ADMIN` only — Q-05 |
| changed_at | timestamptz | YES | |

**Unique:** `member_id` (a member has exactly one current direct referrer) · **Indexes:** `referrer_id` · **Soft delete:** No · **Audit:** Yes — mandatory, this is the Q-05 repoint control point.

### `commission_rules`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| level | int | NO | `CHECK >= 1` |
| rate_basis | text | NO | `CHECK IN ('PERCENT_OF_ORDER','PERCENT_OF_VENDOR_SALE','PERCENT_OF_PLATFORM_FEE','FIXED')` |
| rate_value_bps | int | YES | **Phase 6:** integer basis points (percent×100), not `numeric(7,4)` — set iff `rate_basis` is a `PERCENT_*` variant. See [ADR-0013](adr/0013-commerce-money-math.md)/[ADR-0014](adr/0014-commission-engine.md) |
| rate_value_fixed | bigint | YES | paise — set iff `rate_basis = 'FIXED'` |
| applies_to | text | NO | `CHECK IN ('PRODUCT','SERVICE','PROJECT','EPIN','SUBSCRIPTION')` |
| qualifying_event | text | NO | |
| requires_active_subscription | boolean | NO | **Phase 6:** explicit typed column replacing the generic `eligibility_predicate` jsonb — Q-04, part 1 |
| minimum_activity_count | int | YES | **Phase 6:** explicit typed column, same reason — Q-04, part 2 (see the schema comment on `CommissionRule.minimumActivityCount` for this phase's specific definition of "activity") |
| release_delay_days | int | NO | **Phase 6 addition** — Q-06's "days TBD" release window, now an explicit required field per rule (no implicit app-wide default) |
| effective_from | timestamptz | NO | |
| effective_to | timestamptz | YES | |
| created_by | uuid | NO | FK → `users.id` |

**Indexes:** `(level, applies_to, effective_from)` · **Soft delete:** No — versioned via `effective_to`, never deleted · **Audit:** Yes — mandatory, this is money-rule configuration.

### `commissions` (named `commission_ledger` in the original spec)
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| order_id | uuid | NO | FK → `orders.id` (renamed from `source_order_id`) |
| order_item_id | uuid | YES | **Phase 6 addition** — "where applicable"; unset in this phase, which calculates per matching-kind item group rather than per individual line, see ADR-0014 |
| beneficiary_member_id | uuid | NO | FK → `member_profiles.id` (renamed from `member_id`) |
| level | int | NO | |
| rule_id | uuid | NO | FK → `commission_rules.id` — this IS "rule version": rules are versioned-via-row, never edited in place, so the FK alone pins the exact configuration used |
| qualifying_event | text | NO | snapshot of the rule's qualifying event at creation time |
| calculation_basis | text | NO | snapshot of the rule's `rate_basis` at creation time |
| calculation_base_amount | bigint | NO | paise the rate was applied to (0 for `FIXED`) |
| rate_bps_snapshot | int | YES | |
| rate_fixed_snapshot | bigint | YES | |
| amount | bigint | NO | the calculated commission, paise — **immutable after creation**, see ADR-0014 |
| status | text | NO | `CHECK IN ('PENDING','ELIGIBLE','AVAILABLE','REVERSED','CANCELLED')` — **Phase 6 widens the original 3-state `PENDING/RELEASED/REVERSED`** to the 5-state lifecycle the Phase 6 brief specifies; `ELIGIBLE` is the new "confirmed owed, still inside the release window" state between `PENDING` and `AVAILABLE` (renamed from `RELEASED`), and `CANCELLED` covers an order that never reached completion (nothing to reverse, as opposed to `REVERSED` for a confirmed commission undone by a later refund) |
| release_at | timestamptz | YES | renamed from `release_after`; set when the commission becomes `ELIGIBLE` |

**Unique:** `(order_id, beneficiary_member_id, level)` — the structural guard against ever double-crediting the same referral fact · **Indexes:** `beneficiary_member_id`, `order_id`, `(status, release_at)` · **Soft delete:** No · **Audit:** Yes, via the separate `commission_status_history` table below (not a `reversal_of_id` self-FK — see ADR-0014 for why status is a mutable column on an otherwise-immutable row rather than a strictly insert-only event log).

### `commission_status_history` — not in the original spec (Phase 6 addition)
Append-only mirror of `order_status_history` (see §3) for the commission lifecycle — `commission_id`, `from_status`, `to_status`, `actor_id` (null = system), `reason`, `created_at`. The only writer is `src/server/domain/commission/commission-state-machine.ts`'s `assertCommissionTransition()`, via `commission-service.ts`; nothing else ever writes `commissions.status` directly. See [ADR-0008](adr/0008-explicit-state-machines.md) and [ADR-0014](adr/0014-commission-engine.md).

---

## 6. Wallet

### `wallets`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| owner_user_id | uuid | NO | FK → `users.id` |
| balance | bigint | NO | default `0`, `CHECK >= 0` — Q-07 |
| pending_balance | bigint | NO | default `0`, `CHECK >= 0` |
| currency | char(3) | NO | default `'INR'` |
| wallet_pin_hash | text | YES | Q-13 |

**Unique:** `owner_user_id` · **Soft delete:** No · **Audit:** Yes — balance reconciliation entries, PIN set/change.

### `wallet_transactions`
Insert-only; this is the single ledger table used for both "wallet_transactions" and "wallet_ledger" from the original entity list — see the note in [database.md §6](database.md#6-wallet).

| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| wallet_id | uuid | NO | FK → `wallets.id` |
| direction | text | NO | `CHECK IN ('CREDIT','DEBIT')` |
| amount | bigint | NO | `CHECK > 0` (sign carried by `direction`, not the value) |
| type | text | NO | `CHECK IN ('TOPUP','COMMISSION','PAYOUT','REFUND','REWARD','TRANSFER','ADJUSTMENT')` |
| reference_type | text | NO | e.g. `'COMMISSION_LEDGER'` |
| reference_id | uuid | NO | |
| idempotency_key | text | NO | |
| balance_after | bigint | NO | snapshot for reconciliation |

**Unique:** `idempotency_key` · **Indexes:** `wallet_id`, `(reference_type, reference_id)` · **Soft delete:** No — insert-only, `UPDATE`/`DELETE` revoked · **Audit:** Yes — every insert, highest sensitivity.

---

## 7. Payout

### `payout_requests`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| wallet_id | uuid | NO | FK → `wallets.id` |
| bank_account_id | uuid | NO | FK → `bank_accounts.id` |
| amount | bigint | NO | `CHECK > 0` |
| status | text | NO | `CHECK IN ('REQUESTED','APPROVED','REJECTED','PROCESSING','PAID','FAILED')`, default `REQUESTED` |
| requested_by | uuid | NO | FK → `users.id` |
| approved_by | uuid | YES | FK → `users.id`, `CHECK (approved_by IS NULL OR approved_by <> requested_by)` — Q-12 second-approver rule |
| rejected_reason | text | YES | |

**Indexes:** `wallet_id`, `status` · **Soft delete:** No · **Audit:** Yes — mandatory.

### `payout_transactions`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| payout_request_id | uuid | NO | FK → `payout_requests.id` |
| transfer_reference | text | YES | manual bank-transfer UTR |
| tds_deducted | bigint | NO | default `0` |
| net_amount | bigint | NO | |
| paid_at | timestamptz | YES | |
| recorded_by | uuid | NO | FK → `users.id` |

**Unique:** `payout_request_id` · **Soft delete:** No · **Audit:** Yes.

---

## 8. E-pin & subscription

### `subscription_plans`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| code | text | NO | |
| type | text | NO | `CHECK IN ('YEARLY','TIME_BOUND','LIFETIME')` |
| price | bigint | NO | |
| currency | char(3) | NO | default `'INR'` |
| duration_days | int | YES | null for lifetime |
| benefits_json | jsonb | YES | |
| active | boolean | NO | default `true` |

**Unique:** `code` · **Soft delete:** Yes — deactivate via `active`; `deleted_at` for a plan never actually used · **Audit:** Yes.

### `subscriptions`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| member_id | uuid | NO | FK → `member_profiles.id` |
| plan_id | uuid | NO | FK → `subscription_plans.id` |
| starts_at | timestamptz | NO | |
| expires_at | timestamptz | YES | |
| status | text | NO | `CHECK IN ('ACTIVE','EXPIRED','CANCELLED')`, default `ACTIVE` |

**Indexes:** `member_id`, `status` · **Soft delete:** No (status covers lifecycle) · **Audit:** Yes.

### `epins`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| code_hash | text | NO | raw code never stored — see [security.md](security.md) §7 |
| code_last4 | text | NO | for support lookup/masking |
| plan_id | uuid | NO | FK → `subscription_plans.id` |
| status | text | NO | `CHECK IN ('FRESH','USED','EXPIRED','REVOKED')`, default `FRESH` |
| price | bigint | NO | |
| generated_by | uuid | NO | FK → `users.id` — Q-15 |
| expires_at | timestamptz | YES | |

**Unique:** `code_hash` · **Indexes:** `status`, `plan_id` · **Soft delete:** No — status covers lifecycle, generated record is never deleted · **Audit:** Yes — generation and every status change (explicit brief requirement).

### `epin_redemptions`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| epin_id | uuid | NO | FK → `epins.id` |
| redeemed_by | uuid | NO | FK → `users.id` |
| redeemed_at | timestamptz | NO | default `now()` |
| resulting_subscription_id | uuid | YES | FK → `subscriptions.id` |

**Unique:** `epin_id` (single-use) · **Indexes:** `redeemed_by` · **Soft delete:** No · **Audit:** Yes.

---

## 9. Coupons & rewards

### `coupons`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| code | text | NO | |
| discount_type | text | NO | `CHECK IN ('PERCENT','FIXED')` |
| value_percent_bps | int | YES | **Phase 5:** integer basis points (percent×100), not `numeric(5,2)` — set iff `discount_type='PERCENT'`, see docs/adr/0013-commerce-money-math.md |
| value_fixed | bigint | YES | set iff `discount_type='FIXED'` |
| min_order_amount | bigint | NO | default `0` |
| starts_at | timestamptz | NO | |
| expires_at | timestamptz | YES | |
| usage_limit | int | YES | |
| usage_limit_per_member | int | YES | default `1` |
| created_by | uuid | NO | FK → `users.id` |

**Unique:** `code` · **Soft delete:** Yes · **Audit:** Yes.

### `coupon_redemptions`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| coupon_id | uuid | NO | FK → `coupons.id` |
| member_id | uuid | NO | FK → `member_profiles.id` |
| order_id | uuid | NO | FK → `orders.id` |
| amount_discounted | bigint | NO | |

**Unique:** `(coupon_id, order_id)` · **Indexes:** `(coupon_id, member_id)` for per-member limit checks · **Soft delete:** No · **Audit:** No — low sensitivity, covered by order audit.

### `rewards`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| code | text | NO | |
| type | text | NO | `CHECK IN ('CASH','COUPON','OTHER')` |
| trigger_description | text | YES | undefined pending Q-08 |
| value | bigint | YES | |
| active | boolean | NO | default `false` — inactive until Q-08 resolved |

**Unique:** `code` · **Soft delete:** Yes · **Audit:** Yes.

### `reward_transactions`
Insert-only.

| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| reward_id | uuid | NO | FK → `rewards.id` |
| member_id | uuid | NO | FK → `member_profiles.id` |
| amount | bigint | NO | |
| granted_by | uuid | NO | FK → `users.id` |

**Indexes:** `member_id` · **Soft delete:** No — insert-only · **Audit:** Yes.

---

## 10. Tax / TDS

### `tds_rules`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| section | text | NO | |
| rate | numeric(5,2) | NO | |
| threshold_amount | bigint | NO | default `0` |
| no_pan_rate | numeric(5,2) | NO | |
| effective_from | timestamptz | NO | |
| effective_to | timestamptz | YES | |
| created_by | uuid | NO | FK → `users.id` |

**Indexes:** `effective_from` · **Soft delete:** No — versioned, never deleted · **Audit:** Yes — mandatory, requires CA confirmation (Q-18) before any real row is entered.

### `tds_transactions`
Insert-only.

| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| member_id | uuid | NO | FK → `member_profiles.id` |
| source_ledger_type | text | NO | `CHECK IN ('COMMISSION','PAYOUT')` |
| source_ledger_id | uuid | NO | |
| rule_id | uuid | NO | FK → `tds_rules.id` |
| amount_deducted | bigint | NO | |
| deducted_at_stage | text | NO | `CHECK IN ('CREDIT','PAYOUT')` — Q-18 |

**Indexes:** `member_id` · **Soft delete:** No — insert-only · **Audit:** Yes.

### `tds_reports`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| period_start | date | NO | |
| period_end | date | NO | |
| generated_by | uuid | NO | FK → `users.id` |
| storage_path | text | YES | |

**Indexes:** `(period_start, period_end)` · **Soft delete:** No · **Audit:** Yes — export event.

---

## 11. Bidding

### `bidding_requirements`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| posted_by | uuid | NO | FK → `member_profiles.id` |
| title | text | NO | |
| description | text | NO | |
| budget_hint | bigint | YES | |
| status | text | NO | `CHECK IN ('OPEN','CLOSED','AWARDED','CANCELLED')`, default `OPEN` |

**Indexes:** `posted_by`, `status` · **Soft delete:** Yes · **Audit:** No — low sensitivity until awarded, at which point `orders`/`payments` audit takes over.

### `bids`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| requirement_id | uuid | NO | FK → `bidding_requirements.id` |
| vendor_id | uuid | NO | FK → `vendor_profiles.id` |
| amount | bigint | NO | |
| sealed_until | timestamptz | NO | |
| status | text | NO | `CHECK IN ('SUBMITTED','ACCEPTED','REJECTED')`, default `SUBMITTED` |

**Unique:** `(requirement_id, vendor_id)` — one bid per vendor per requirement · **Indexes:** `requirement_id` · **Soft delete:** No · **Audit:** Yes — acceptance event.

---

## 12. Messaging, support, notifications, content

### `internal_messages`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| sender_id | uuid | NO | FK → `users.id` |
| recipient_id | uuid | NO | FK → `users.id` |
| body | text | NO | |
| read_at | timestamptz | YES | |

**Indexes:** `recipient_id`, `sender_id` · **Soft delete:** No · **Audit:** No.

### `support_tickets`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| ticket_number | text | NO | |
| raised_by | uuid | NO | FK → `users.id` |
| subject | text | NO | |
| status | text | NO | `CHECK IN ('OPEN','IN_PROGRESS','RESOLVED','CLOSED')`, default `OPEN` |
| priority | text | NO | `CHECK IN ('LOW','NORMAL','HIGH','URGENT')`, default `NORMAL` |
| assigned_to | uuid | YES | FK → `users.id` |

**Unique:** `ticket_number` · **Indexes:** `raised_by`, `status`, `assigned_to` · **Soft delete:** No · **Audit:** Yes — status changes, assignment.

### `support_messages`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| ticket_id | uuid | NO | FK → `support_tickets.id` |
| sender_id | uuid | NO | FK → `users.id` |
| body | text | NO | |

**Indexes:** `ticket_id` · **Soft delete:** No · **Audit:** No — covered by parent ticket.

### `notifications`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| user_id | uuid | NO | FK → `users.id` |
| type | text | NO | |
| payload_json | jsonb | NO | |
| channel | text | NO | `CHECK IN ('IN_APP','SMS','EMAIL','WHATSAPP')` |
| read_at | timestamptz | YES | |

**Indexes:** `(user_id, read_at)` · **Soft delete:** No — purged by a retention job · **Audit:** No — high volume, non-financial.

### `feedback`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| member_id | uuid | NO | FK → `member_profiles.id` |
| body | text | NO | |
| rating | int | YES | `CHECK BETWEEN 1 AND 5` |

**Indexes:** `member_id` · **Soft delete:** No · **Audit:** No.

### `blogs`
Purpose: blog section/category.

| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| name | text | NO | |
| slug | text | NO | |

**Unique:** `slug` · **Soft delete:** Yes · **Audit:** No.

### `blog_posts`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| blog_id | uuid | YES | FK → `blogs.id` |
| author_id | uuid | NO | FK → `users.id` — admin-only per Q-36 |
| title | text | NO | |
| slug | text | NO | |
| body | text | NO | |
| status | text | NO | `CHECK IN ('DRAFT','PUBLISHED','ARCHIVED')`, default `DRAFT` |
| published_at | timestamptz | YES | |

**Unique:** `slug` · **Indexes:** `status`, `blog_id` · **Soft delete:** Yes · **Audit:** No — content, not financial.

### `advertisements`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| title | text | NO | |
| storage_path | text | NO | |
| link_url | text | YES | |
| placement | text | NO | |
| active | boolean | NO | default `true` |
| starts_at | timestamptz | YES | |
| ends_at | timestamptz | YES | |
| created_by | uuid | NO | FK → `users.id` |

**Soft delete:** Yes · **Audit:** No.

### `banners`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| title | text | NO | |
| storage_path | text | NO | 1920×640 JPG/WebP, <300KB per the client's content spec |
| link_url | text | YES | |
| sort_order | int | NO | default `0` |
| active | boolean | NO | default `true` |
| created_by | uuid | NO | FK → `users.id` |

**Soft delete:** Yes · **Audit:** No.

---

## 13. Platform, settings, audit

### `system_settings`
| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| key | text | NO | |
| value_json | jsonb | NO | |
| value_type | text | NO | `CHECK IN ('STRING','NUMBER','BOOLEAN','JSON')` |
| updated_by | uuid | YES | FK → `users.id`; **Phase 5:** nullable — the seed-time GST/platform-fee defaults are system-set with no human actor yet, same allowance as `audit_logs.actor_id` |

**Unique:** `key` · **Soft delete:** No · **Audit:** Yes — mandatory. Phase 5 uses this table for `commerce.gst_rate_bps` / `commerce.platform_fee_rate_bps` — see `src/server/lib/pricing-config.ts` and `prisma/seed.ts`.

### `maintenance_settings`
Singleton row, enforced at the application layer.

| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| enabled | boolean | NO | default `false` |
| message | text | YES | |
| enabled_by | uuid | YES | FK → `users.id` |
| enabled_at | timestamptz | YES | |

**Soft delete:** No · **Audit:** Yes — mandatory.

### `audit_logs`
Purpose: the audit mechanism itself — see [audit-logging.md](audit-logging.md).

| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| actor_id | uuid | YES | FK → `users.id`, nullable for system-triggered actions |
| action | text | NO | |
| entity_type | text | NO | |
| entity_id | uuid | NO | |
| before_json | jsonb | YES | redacted per [security.md](security.md) §8 |
| after_json | jsonb | YES | redacted per [security.md](security.md) §8 |
| ip | text | YES | |
| user_agent | text | YES | |

**Indexes:** `(entity_type, entity_id)`, `actor_id`, `created_at` · **Soft delete:** No — insert-only, `UPDATE`/`DELETE` fully revoked · **Audit:** N/A — this table is the audit mechanism.

### `webhook_events`
Purpose: cross-provider idempotency ledger for non-Razorpay callbacks (e.g., MSG91 delivery status) — Razorpay has its own specialized `payment_events`.

| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| provider | text | NO | |
| event_id | text | NO | |
| payload | jsonb | NO | |
| processed_at | timestamptz | YES | |

**Unique:** `(provider, event_id)` · **Soft delete:** No · **Audit:** Implicit.

### `files`
Purpose: generic attachment registry for anything not covered by a dedicated `*_images`/`*_documents` table (primarily KYC uploads).

| Field | Type | Null | Notes |
|---|---|---|---|
| id | uuid | NO | PK |
| owner_type | text | NO | e.g. `'KYC'`, `'PROJECT_DOC'`, `'MISC'` |
| owner_id | uuid | NO | |
| storage_path | text | NO | |
| mime_type | text | NO | validated per [file-upload.md](file-upload.md) |
| size_bytes | int | NO | |
| uploaded_by | uuid | NO | FK → `users.id` |

**Indexes:** `(owner_type, owner_id)` · **Soft delete:** Yes · **Audit:** Yes when `owner_type='KYC'`, otherwise No.

---

## Summary: soft-delete and audit posture at a glance

| Category | Soft delete | Audit |
|---|---|---|
| Ledger tables (`*_ledger`, `*_transactions`, `payment_events`, `audit_logs`) | Never — insert-only, `UPDATE`/`DELETE` revoked | Always (or is itself the audit mechanism) |
| Status-driven entities (`orders`, `subscriptions`, `vendor_profiles`, `carts`) | No — lifecycle lives in `status` | Yes for anything money/approval-related |
| Catalog & content (`products`, `services`, `projects`, `blog_posts`, `coupons`, `banners`) | Yes | Yes for catalog approval flows; No for pure content |
| Pure media/junction rows (`*_images`, `cart_items`, `role_permissions` excluded — see below) | No, hard-deleted | No |
| Security-relevant configuration (`role_permissions`, `commission_rules`, `tds_rules`, `system_settings`) | No — versioned/never deleted | Always |
