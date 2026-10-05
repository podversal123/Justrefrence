# Just Reference — Relationship Mapping (Phase 0)

Every foreign key in [database-tables.md](database-tables.md), listed as a standalone reference with cardinality and delete behavior. Default `ON DELETE` is `RESTRICT` unless noted — nothing in this schema cascades a delete into a financial or audit table; the only cascades allowed are on genuinely dependent, non-financial child rows (e.g. `product_images` under `products`).

## Identity & access

| Relationship | Cardinality | On delete |
|---|---|---|
| `member_profiles.user_id → users.id` | 1:1 | RESTRICT (a user is never hard-deleted while a member profile exists) |
| `member_profiles.referred_by_user_id → users.id` | many:1 | SET NULL (referrer account status doesn't force cascading deletion of the relationship — repointing is the controlled path, per Q-05) |
| `addresses.owner_user_id → users.id` | many:1 | CASCADE (addresses are owned outright by the user) |
| `bank_accounts.user_id → users.id` | many:1 | RESTRICT (financial record; removal is a soft-delete, not a hard cascade) |
| `bank_accounts.verified_by → users.id` | many:1 | SET NULL |
| `vendor_profiles.member_profile_id → member_profiles.id` | 1:1 | RESTRICT |
| `vendor_profiles.approved_by → users.id` | many:1 | SET NULL |
| `role_permissions.role_id → roles.id` | many:1 | CASCADE (a role's permission bundle dies with the role — roles are seed data, not expected to be deleted in practice) |
| `role_permissions.permission_id → permissions.id` | many:1 | RESTRICT |
| `user_roles.user_id → users.id` | many:1 | RESTRICT |
| `user_roles.role_id → roles.id` | many:1 | RESTRICT |
| `user_roles.granted_by / revoked_by → users.id` | many:1 | SET NULL |
| `otp_verifications.user_id → users.id` | many:1 | CASCADE |

## Catalog

| Relationship | Cardinality | On delete |
|---|---|---|
| `product_subcategories.category_id → product_categories.id` | many:1 | RESTRICT |
| `products.vendor_id → vendor_profiles.id` | many:1 | RESTRICT |
| `products.category_id / subcategory_id → product_categories / product_subcategories` | many:1 | RESTRICT |
| `products.approved_by → users.id` | many:1 | SET NULL |
| `product_images.product_id → products.id` | many:1 | CASCADE |
| (services/projects mirror the products pattern exactly — `services.vendor_id`, `projects.vendor_id` → `vendor_profiles.id` RESTRICT; `*_images`/`project_documents`/`project_milestones` → parent CASCADE) | | |

## Cart, orders, checkout

| Relationship | Cardinality | On delete |
|---|---|---|
| `cart_items.cart_id → carts.id` | many:1 | CASCADE |
| `checkouts.cart_id → carts.id` | many:1 | RESTRICT |
| `checkouts.coupon_id → coupons.id` | many:1 | SET NULL |
| `orders.checkout_id → checkouts.id` | many:1 | RESTRICT |
| `orders.vendor_id → vendor_profiles.id` | many:1 | RESTRICT |
| `orders.buyer_id → users.id` | many:1 | RESTRICT |
| `order_items.order_id → orders.id` | many:1 | RESTRICT (orders and their line items are permanent financial records) |
| `order_vendor_groups.order_id → orders.id` | 1:1 | RESTRICT |
| `order_vendor_groups.checkout_id → checkouts.id` | many:1 | RESTRICT |
| `order_status_history.order_id → orders.id` | many:1 | RESTRICT |

## Payments & invoicing

| Relationship | Cardinality | On delete |
|---|---|---|
| `payments.order_id → orders.id` | many:1 (nullable) | RESTRICT |
| `payments.payer_id → users.id` | many:1 | RESTRICT |
| `payment_events.payment_id → payments.id` | many:1 (nullable) | RESTRICT |
| `payment_transactions.payment_id → payments.id` | many:1 | RESTRICT |
| `invoices.order_id → orders.id` | 1:1 | RESTRICT |
| `invoice_items.invoice_id → invoices.id` | many:1 | RESTRICT |
| `invoice_items.order_item_id → order_items.id` | many:1 | RESTRICT |

## Referral & commission

| Relationship | Cardinality | On delete |
|---|---|---|
| `referral_relationships.member_id → member_profiles.id` | 1:1 (one active row per member) | RESTRICT |
| `referral_relationships.referrer_id → member_profiles.id` | many:1 | RESTRICT |
| `commission_ledger.member_id → member_profiles.id` | many:1 | RESTRICT |
| `commission_ledger.source_order_id → orders.id` | many:1 | RESTRICT |
| `commission_ledger.rule_id → commission_rules.id` | many:1 | RESTRICT |
| `commission_ledger.reversal_of_id → commission_ledger.id` | self-referencing, many:1 | RESTRICT |

## Wallet & payout

| Relationship | Cardinality | On delete |
|---|---|---|
| `wallets.owner_user_id → users.id` | 1:1 | RESTRICT |
| `wallet_transactions.wallet_id → wallets.id` | many:1 | RESTRICT |
| `payout_requests.wallet_id → wallets.id` | many:1 | RESTRICT |
| `payout_requests.bank_account_id → bank_accounts.id` | many:1 | RESTRICT |
| `payout_requests.requested_by / approved_by → users.id` | many:1 | RESTRICT / SET NULL respectively |
| `payout_transactions.payout_request_id → payout_requests.id` | 1:1 | RESTRICT |

## E-pin, subscription, coupon, reward

| Relationship | Cardinality | On delete |
|---|---|---|
| `subscriptions.member_id → member_profiles.id` | many:1 | RESTRICT |
| `subscriptions.plan_id → subscription_plans.id` | many:1 | RESTRICT |
| `epins.plan_id → subscription_plans.id` | many:1 | RESTRICT |
| `epin_redemptions.epin_id → epins.id` | 1:1 | RESTRICT |
| `epin_redemptions.resulting_subscription_id → subscriptions.id` | many:1 (nullable) | SET NULL |
| `coupon_redemptions.coupon_id / member_id / order_id → coupons / member_profiles / orders` | many:1 | RESTRICT |
| `reward_transactions.reward_id / member_id → rewards / member_profiles` | many:1 | RESTRICT |

## Tax

| Relationship | Cardinality | On delete |
|---|---|---|
| `tds_transactions.member_id → member_profiles.id` | many:1 | RESTRICT |
| `tds_transactions.rule_id → tds_rules.id` | many:1 | RESTRICT |

## Bidding

| Relationship | Cardinality | On delete |
|---|---|---|
| `bidding_requirements.posted_by → member_profiles.id` | many:1 | RESTRICT |
| `bids.requirement_id → bidding_requirements.id` | many:1 | CASCADE (bids are meaningless without their requirement; requirement soft-delete is the actual removal path in practice) |
| `bids.vendor_id → vendor_profiles.id` | many:1 | RESTRICT |

## Messaging, support, content

| Relationship | Cardinality | On delete |
|---|---|---|
| `internal_messages.sender_id / recipient_id → users.id` | many:1 | RESTRICT |
| `support_tickets.raised_by / assigned_to → users.id` | many:1 | RESTRICT / SET NULL |
| `support_messages.ticket_id → support_tickets.id` | many:1 | CASCADE |
| `notifications.user_id → users.id` | many:1 | CASCADE |
| `feedback.member_id → member_profiles.id` | many:1 | RESTRICT |
| `blog_posts.blog_id → blogs.id` | many:1 (nullable) | SET NULL |
| `blog_posts.author_id → users.id` | many:1 | RESTRICT |

## Platform

| Relationship | Cardinality | On delete |
|---|---|---|
| `audit_logs.actor_id → users.id` | many:1 (nullable) | SET NULL |
| `files.uploaded_by → users.id` | many:1 | RESTRICT |

## Why `RESTRICT` is the default, not `CASCADE`

A cascading delete on any table that participates in the money trail (orders, payments, ledgers, invoices) would let a single delete silently erase financial history — exactly what [ADR-0002](adr/0002-money-representation.md) and the audit requirements in [audit-logging.md](audit-logging.md) exist to prevent. `RESTRICT` forces every such deletion to be a deliberate, explicit decision (and in practice, most "deletable" entities in this schema are soft-deleted via `deleted_at`, not hard-deleted at all — see the summary table in [database-tables.md](database-tables.md)). `CASCADE` is reserved for genuinely dependent, non-financial rows that have no meaning without their parent (images, cart items, ticket messages, notifications).
