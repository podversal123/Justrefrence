# Just Reference — API Conventions & Module Map (Phase 0)

## 1. Surface split

Two kinds of server endpoints, both under the layering rule in [architecture.md](architecture.md):

- **Server Actions** — used by Server/Client Components inside the app itself for form-bound mutations (place order, update profile, submit payout request). Not versioned, not meant for external consumption, but still go through `authorize()` + Zod validation + the service layer exactly like a Route Handler.
- **Route Handlers** (`src/app/api/**`) — used for: (1) webhooks (Razorpay, MSG91 delivery status), (2) anything that needs a stable versioned contract for Postman/QA/future mobile clients, (3) cron-triggered jobs. Versioned under `/api/v1/...`.

Both call into the same `src/server/services/*` layer, so business logic is never duplicated between the two surfaces.

## 2. Response envelope

All Route Handlers return a consistent JSON envelope:

```json
// success
{ "success": true, "data": { ... }, "meta": { "requestId": "..." } }

// failure
{ "success": false, "error": { "code": "ORDER_NOT_FOUND", "message": "Order could not be found" }, "meta": { "requestId": "..." } }
```

- `error.code` is a stable, machine-readable string (`SCREAMING_SNAKE_CASE`), documented per endpoint; `error.message` is a safe, user-presentable string. Stack traces / raw DB errors are never included — full detail goes to server logs keyed by `meta.requestId` (see [security.md §8](security.md#8-logging-discipline)).
- HTTP status codes are still meaningful (400/401/403/404/409/422/429/500) — the envelope doesn't replace them, it standardizes the body shape across all of them.
- Server Actions use the same envelope shape as their return type (not raw thrown exceptions to the client), so client-side error handling is uniform regardless of which surface was called.

## 3. Common error codes

| Code | HTTP | Meaning |
|---|---|---|
| `UNAUTHENTICATED` | 401 | No/invalid session |
| `FORBIDDEN` | 403 | Authenticated, but role/permission/ownership check failed |
| `ACCOUNT_BLOCKED` | 403 | Account-status gate failed |
| `VALIDATION_ERROR` | 422 | Zod validation failed; `error.details` lists field-level issues |
| `NOT_FOUND` | 404 | Resource doesn't exist or isn't visible to this caller |
| `CONFLICT` | 409 | e.g. illegal state transition, duplicate idempotency key with different payload |
| `RATE_LIMITED` | 429 | Too many requests |
| `PAYMENT_VERIFICATION_FAILED` | 400 | Razorpay signature invalid |
| `INSUFFICIENT_BALANCE` | 409 | Wallet debit would go negative |
| `INTERNAL_ERROR` | 500 | Unexpected server error (logged with full detail server-side) |

## 4. Pagination, filtering, sorting

- Default: cursor-based pagination (`?cursor=...&limit=20`) for high-growth collections (orders, wallet transactions, commission ledger, audit logs, members) — avoids the "never fetch an entire table" trap as data grows.
- Offset pagination (`?page=&pageSize=`) is acceptable only for small, bounded admin lists (e.g., category lists, commission rule versions).
- Filtering/sorting parameters are explicit and allowlisted per endpoint (never a raw pass-through of query params into a DB `ORDER BY`/`WHERE`).

## 5. Module → route map

| Module | Route Handler base | Representative endpoints | Primary Server Actions |
|---|---|---|---|
| identity | `/api/v1/auth` | `POST /otp/request`, `POST /otp/verify`, `POST /session/refresh` | `signUp`, `login`, `resetPassword`, `changePassword` |
| catalog | `/api/v1/catalog` | `GET /products`, `GET /products/:id`, `GET /categories` (public, cached) | `createProduct`, `updateProduct`, `approveListing`, `uploadListingImage` |
| cart-checkout | `/api/v1/cart` | `GET /cart` | `addToCart`, `removeFromCart`, `startCheckout` |
| orders | `/api/v1/orders` | `GET /orders`, `GET /orders/:id`, `GET /orders/:id/tracking` | `placeOrder`, `updateOrderStatus`, `cancelOrder` |
| payments | `/api/v1/payments`, `/api/webhooks/razorpay` | `POST /payments/verify`, `POST /webhooks/razorpay` (webhook, not versioned under v1) | `initiatePayment` |
| invoicing | `/api/v1/invoices` | `GET /invoices/:id`, `GET /invoices/:id/pdf` | — |
| referral | `/api/v1/referrals` | `GET /referrals`, `GET /referrals/tree` | `createReferral` |
| commission | `/api/v1/commissions` | `GET /commissions`, `GET /commissions/rules` (admin) | `approveCommission` |
| wallet | `/api/v1/wallet` | `GET /wallet`, `GET /wallet/transactions` | `topUpWallet`, `setWalletPin` |
| payout | `/api/v1/payouts` | `GET /payouts`, `POST /payouts` | `requestPayout`, `approvePayout`, `rejectPayout` |
| epin-subscription | `/api/v1/epins`, `/api/v1/subscriptions` | `GET /epins/search` (admin), `POST /epins/redeem` | `generateEpin`, `redeemEpin` |
| coupon-reward | `/api/v1/coupons` | `POST /coupons/validate` | `applyCoupon`, `grantReward` |
| tds-tax | `/api/v1/tds` | `GET /tds/report` | — |
| bidding | `/api/v1/requirements` | `GET /requirements`, `POST /requirements/:id/bids` | `postRequirement`, `submitBid`, `acceptBid` |
| messaging-support | `/api/v1/messages`, `/api/v1/tickets` | `GET /tickets`, `POST /tickets` | `sendMessage`, `createTicket`, `respondToTicket` |
| admin-ops | `/api/v1/admin` | `GET /admin/members`, `POST /admin/members/:id/block` | `updateSettings`, `toggleMaintenance` |
| audit | `/api/v1/audit` | `GET /audit/logs` (SUPER_ADMIN only) | — |
| cron | `/api/cron/*` | `GET /cron/birthday-notifications` (Phase 4, implemented), `GET /cron/release-commissions` (Phase 6, implemented), `GET /cron/expire-epins`, `GET /cron/reconcile-wallets` | — (Vercel Cron triggers via `GET`; authenticated via `Authorization: Bearer $CRON_SECRET`, which Vercel attaches automatically for a configured cron — see `src/app/api/cron/birthday-notifications/route.ts` for the pattern every other cron route follows) |

Every non-public endpoint above requires the permission codes listed in [rbac.md](rbac.md) §3–4; this table does not repeat them to avoid drift between two documents — `rbac.md` is authoritative for *who*, this document is authoritative for *where*.

## 6. Idempotency

Any endpoint an external system or a flaky client can retry accepts (or generates) an idempotency key:

- Razorpay webhooks: keyed by the provider's `event.id` (see [database.md §6/Payments](database.md#4-payments--invoicing) `webhook_events`/`payment_events`).
- Client-initiated financial mutations (wallet top-up confirm, payout request submit) accept an `Idempotency-Key` header; the server stores it against the resulting resource and returns the original result on a repeat with the same key, rejecting (`CONFLICT`) a repeat with the same key but a different payload.

## 7. Versioning & deprecation

- `/api/v1/...` — breaking changes require a new `/api/v2/...` path, not an in-place change. Webhook endpoints are not versioned in the URL (the provider dictates the contract); internal payload-shape changes are handled by tolerant parsing.
- Server Actions are not versioned (they ship with the page that calls them, by definition), but their Zod input/output schemas are still tracked in `src/lib/schemas` for reuse in tests.

## 8. Postman collection

A Postman collection (`postman/just-reference.postman_collection.json`) mirrors every Route Handler in §5, with environment variables for base URL + auth token, and pre-request scripts that populate the `Idempotency-Key` header where applicable. It is generated/maintained alongside the API in Phase 1+ (not hand-written once and left to rot) — each new endpoint PR includes its Postman entry, checked in CI by a simple "route exists in collection" lint script.

## 9. Realtime channels (Supabase Realtime)

Not REST, but part of the API surface contract:

| Channel | Payload | Consumers |
|---|---|---|
| `wallet:{user_id}` | balance-changed ping (no amount in payload — client refetches via React Query) | member wallet page |
| `order:{order_id}` | status-changed ping | order tracking page |
| `notifications:{user_id}` | new notification ping | bell icon |
| `messages:{thread_id}` | new message ping | internal messaging / support ticket thread |

Realtime pushes are **notification-only** (a "something changed, refetch" ping), never the sole carrier of authoritative data — this avoids ever trusting a realtime payload as a financial source of truth.
