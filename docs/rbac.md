# Just Reference — RBAC Matrix (Phase 0)

## 1. Model

Permission-based authorization, not role-string checks in code. A **role** is a named bundle of **permissions** (`role_permissions`); a **user** holds one or more roles (`user_roles`); every protected operation checks a permission code, not a role name, so the mapping of roles → permissions can be edited by `SUPER_ADMIN` without touching code (Q-30: "admin sub-roles as permission sets").

Every protected backend operation runs five checks, in order, via one shared `authorize()` helper (never re-implemented per route):

1. **Authentication** — valid session (Supabase Auth JWT).
2. **Role** — user holds a role capable of the action at all.
3. **Permission** — that role (or an override grant) includes the specific permission code.
4. **Resource ownership** — e.g. a `VENDOR` may only mutate their own `products`; a `CUSTOMER` may only view their own `orders`. Checked by comparing the resource's owning `user_id`/`vendor_id` to the session's.
5. **Business-rule state + account status** — e.g. an order can only be cancelled from a cancellable status; a `BLOCKED` member cannot place orders even if their role/permission checks pass.

Frontend route/section hiding is a UX convenience only — it is **not** a security boundary. Every one of the five checks above is enforced server-side (Route Handler / Server Action), independent of what the UI shows.

## 2. Roles

| Role | Summary | Panel |
|---|---|---|
| `SUPER_ADMIN` | Full platform control: RBAC config, financial rule config (commission/TDS/GST/fees), settings, audit, kill-switches | Super Admin panel |
| `ADMIN` | Day-to-day platform operations: catalog approval, member management, e-pins, blog, banners, feedback | Admin panel |
| `FINANCE` | Money operations: payout approval, TDS/GST reporting, wallet oversight, bank-transfer recording | Admin panel (Finance-scoped) |
| `SUPPORT` | Tickets, internal messaging, read-only member lookups for support purposes | Admin panel (Support-scoped) |
| `VENDOR` | Sell products/services/projects, manage own listings, view own sales/payouts | Member panel (vendor tabs) |
| `CUSTOMER` | Browse/buy, refer others, manage own wallet/profile | Member panel |

`VENDOR` and `CUSTOMER` are **not mutually exclusive** — every member starts as `CUSTOMER`; applying for and being approved as a vendor adds the `VENDOR` role to the same user (Q-31). Admin sub-roles (`ADMIN`/`FINANCE`/`SUPPORT`) are separate accounts created by `SUPER_ADMIN`, matching Q-30.

## 3. Permission catalog

Namespaced `resource:action`. This list is seed data (`permissions` table) and the canonical reference for every `requirePermission()` call — new permissions are added here first, then wired into code, never the reverse.

### Identity & access
`user:create` · `user:read` · `user:update` · `user:block` · `user:unblock` · `role:read` · `role:assign` · `permission:read` · `permission:update` · `vendor:apply` · `vendor:approve` · `vendor:reject` · `vendor:suspend`

### Catalog
`product:create` · `product:read` · `product:update` · `product:delete` · `product:approve` · `service:create` · `service:read` · `service:update` · `service:delete` · `service:approve` · `project:create` · `project:read` · `project:update` · `project:delete` · `project:approve` · `category:manage`

### Cart & orders
`cart:manage` (own cart only — ownership check applies) · `order:create` · `order:read` · `order:read:any` (admin/support override) · `order:update_status` · `order:cancel` · `invoice:read` · `invoice:generate`

### Payments
`payment:read` · `payment:webhook_process` (system-role only, not assignable to a human)

### Referral & commission
`referral:read` · `referral:read:any` · `referral:create` · `referral:repoint` (`SUPER_ADMIN` only, per Q-05) · `commission:read` · `commission:read:any` · `commission:approve` · `commission_rule:read` · `commission_rule:update`

### Wallet & payout
`wallet:read` · `wallet:read:any` · `wallet:topup` · `wallet:transfer` (dormant until Q-10 resolved) · `wallet:withdraw` (= submit a payout request) · `payout:request` · `payout:approve` · `payout:reject` · `payout:record_transfer` · `wallet_pin:set`

### E-pin & subscription
`epin:generate` · `epin:read` · `epin:read:any` · `epin:redeem` · `epin:revoke` · `subscription_plan:manage` · `subscription:read`

### Coupons & rewards
`coupon:create` · `coupon:update` · `coupon:read` · `coupon:redeem` · `reward:read` · `reward:grant` · `reward:read:any`

### Tax
`tds_rule:manage` · `tds:read` · `tds:read:any` · `tds_report:export` · `gst_rule:manage`

### Bidding
`requirement:create` · `requirement:read` · `bid:submit` · `bid:accept` · `bid:read:any`

### Messaging, support, content
`message:send` · `message:read` · `ticket:create` · `ticket:read` · `ticket:read:any` · `ticket:respond` · `ticket:close` · `notification:read` · `blog:create` · `blog:publish` · `banner:manage` · `feedback:submit` · `feedback:read`

### Members & moderation
`member:read` · `member:read:any` · `member:block` · `member:unblock` · `member:filter_list`

### Platform
`settings:read` · `settings:update` · `maintenance:toggle` · `audit:read`

## 4. Role → permission matrix

Legend: ✅ granted by default · — not granted (can still be overridden per-user by `SUPER_ADMIN` via `role:assign`/explicit grant, logged to `audit_logs`)

| Permission (grouped) | SUPER_ADMIN | ADMIN | FINANCE | SUPPORT | VENDOR | CUSTOMER |
|---|:---:|:---:|:---:|:---:|:---:|:---:|
| user:create / block / unblock | ✅ | ✅ | — | — | — | — |
| role:assign / permission:update | ✅ | — | — | — | — | — |
| vendor:approve / reject / suspend | ✅ | ✅ | — | — | — | — |
| vendor:apply | ✅ | ✅ | — | — | — | ✅ |
| product/service/project:create/update/delete (own) | ✅ | ✅ | — | — | ✅ | — |
| product/service/project:approve | ✅ | ✅ | — | — | — | — |
| category:manage | ✅ | ✅ | — | — | — | — |
| cart:manage / order:create (own) | ✅ | — | — | — | ✅ | ✅ |
| order:read (own) / invoice:read (own) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| order:read:any | ✅ | ✅ | ✅ | ✅ (support-relevant fields only) | — | — |
| order:update_status | ✅ | ✅ | — | — | ✅ (own, vendor-controlled transitions only) | — |
| order:cancel | ✅ | ✅ | — | — | ✅ (own, pre-ship) | ✅ (own, pre-ship) |
| payment:webhook_process | system | — | — | — | — | — |
| referral:read (own) / referral:create | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| referral:read:any | ✅ | ✅ | ✅ | ✅ | — | — |
| referral:repoint | ✅ | — | — | — | — | — |
| commission:read (own) | ✅ | — | ✅ | — | ✅ | ✅ |
| commission:read:any / approve | ✅ | — | ✅ | — | — | — |
| commission_rule:read / update | ✅ | — | ✅ read-only | — | — | — |
| wallet:read (own) / topup | ✅ | — | ✅ | — | ✅ | ✅ |
| wallet:read:any | ✅ | — | ✅ | ✅ (masked) | — | — |
| wallet:withdraw / payout:request | ✅ | — | — | — | ✅ | ✅ |
| payout:approve / reject / record_transfer | ✅ | — | ✅ | — | — | — |
| wallet_pin:set | ✅ | — | — | — | ✅ | ✅ |
| epin:generate | ✅ | ✅ | — | — | — | — (unless "member special subscription" self-generation is confirmed, Q-15) |
| epin:redeem / read (own) | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| epin:read:any / revoke | ✅ | ✅ | — | — | — | — |
| subscription_plan:manage | ✅ | — | ✅ | — | — | — |
| coupon:create / update | ✅ | ✅ | — | — | — | — |
| coupon:redeem | ✅ | — | — | — | ✅ | ✅ |
| reward:grant | ✅ | ✅ | ✅ | — | — | — |
| reward:read (own) | ✅ | — | — | — | ✅ | ✅ |
| tds_rule:manage / gst_rule:manage | ✅ | — | ✅ (propose; SUPER_ADMIN activates) | — | — | — |
| tds:read:any / tds_report:export | ✅ | — | ✅ | — | — | — |
| tds:read (own) | ✅ | — | ✅ | — | ✅ | ✅ |
| requirement:create / bid:submit / bid:accept | ✅ | — | — | — | ✅ (submit only) | ✅ (create/accept) |
| bid:read:any | ✅ | ✅ | — | — | — | — |
| message:send/read | ✅ | ✅ | — | ✅ | ✅ | ✅ |
| ticket:create / read (own) | ✅ | ✅ | — | ✅ | ✅ | ✅ |
| ticket:read:any / respond / close | ✅ | ✅ | — | ✅ | — | — |
| blog:create / publish | ✅ | ✅ | — | — | — | — |
| banner:manage | ✅ | ✅ | — | — | — | — |
| feedback:submit | ✅ | — | — | — | ✅ | ✅ |
| feedback:read | ✅ | ✅ | — | ✅ | — | — |
| member:read:any / block / unblock / filter_list | ✅ | ✅ | — | ✅ (read-only) | — | — |
| settings:read / update | ✅ | ✅ read-only | — | — | — | — |
| maintenance:toggle | ✅ | — | — | — | — | — |
| audit:read | ✅ | — | — | — | — | — |

Notes:
- "own" always implies the resource-ownership check in step 4 of `authorize()` — it is not a separate permission, it's the same permission code plus an ownership predicate evaluated per-request.
- `FINANCE`'s `commission_rule:update` is shown as read-only by default per the "who may change money rules" principle (only `SUPER_ADMIN` activates a rule version) — `FINANCE` can propose/draft a new rule version but not make it effective. This mirrors how `tds_rule`/`gst_rule` are handled and should be confirmed alongside Q-30.
- `epin:generate` for `CUSTOMER`/`VENDOR` is left **ungranted by default**, pending Q-15 ("who can generate — admin only, or members for a special subscription").

## 5. Session & account-status gates (apply above the permission matrix)

| Status | Effect |
|---|---|
| `PENDING_VERIFICATION` | Can complete signup/OTP flows only; no catalog/order/wallet actions |
| `ACTIVE` | Normal access per role/permission matrix |
| `BLOCKED` (member blacklist) | All write permissions denied regardless of role/permission grant; read-only access to own historical data | 
| Vendor `SUSPENDED` | `VENDOR` role's write permissions denied; `CUSTOMER` permissions unaffected |
| Idle timeout | Session invalidated after the confirmed idle period (Q-37 default: 30 minutes) — re-authentication required, not just a UI redirect |

## 6. Unresolved RBAC items (carried into business-rules.md)

- Q-29 — full Super Admin feature confirmation (page 2 of the client's notes is missing; this matrix uses the live demo's Super Admin scope as the working baseline).
- Q-30 — exact admin sub-role boundaries and the precise contents of a "vendor rights" bundle.
- Q-33 — whether members eventually get two-step login (currently admin-only, per the Live Testing doc §15).
