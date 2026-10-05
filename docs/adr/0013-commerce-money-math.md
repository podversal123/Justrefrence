# ADR-0013: Commerce money math — integer basis-point rates, checkout-level idempotency, no payment gateway yet

## Status
Accepted

## Context
Phase 5 builds cart → multi-vendor checkout → orders → invoicing. Three implementation questions came up that the Phase 0 docs didn't fully pin down:

1. **Rate representation.** `database-tables.md` types `coupons.value_percent` and `invoice_items.gst_rate` as `numeric(5,2)`. [ADR-0002](0002-money-representation.md) already bans floats and discourages "a bare `numeric` used for arithmetic in application code" for money columns — but a percentage *rate* isn't itself a money column, so it wasn't explicitly covered.
2. **Idempotent order creation.** The brief requires order creation to be idempotent and safe against duplicate checkout submissions (double-click, retried request). The spec's only `idempotency_key` column lives on `payments` — but Phase 5 does not build a live payment-gateway integration (see point 3), so there is no `payments` row to key off yet.
3. **Payment gateway timing.** The brief's Phase 5 deliverables are cart/checkout/order-creation/status/history/invoicing — it does not ask for a live Razorpay integration, and [business-rules.md Q-28](../business-rules.md) only confirms Razorpay as the eventual provider, not that it ships this phase.

## Decision
1. **Every rate (coupon percent, GST rate, platform fee rate) is stored and computed as an integer "basis points ×100" value** (e.g. `18.5%` → `1850`), never `Decimal`/`numeric`/float. All tax/fee/discount math is `(amount_paise * rateBps + 5000n) / 10000n` — round-half-up, integer-only, in `src/server/domain/commerce/pricing.ts`. This is ADR-0002's "no floats, no bare numeric arithmetic" principle applied consistently to rates, not just balances.
2. **`Checkout.idempotencyKey`** (unique, required) is the idempotency anchor for order creation, not a `payments.idempotency_key`. The client generates one UUID per checkout attempt and resubmits the same key on retry; `checkout-service.ts` looks it up first and returns the existing result instead of re-running the transaction. The entire cart→orders conversion (price recompute, stock decrement, order/item/history rows, checkout row) happens inside one Prisma transaction, so a crash mid-flight leaves nothing committed (safe to retry with the same key) rather than a stuck `PENDING` row.
3. **No `payments`/`payment_events`/`payment_transactions` tables yet.** Order creation produces a `PLACED` order. Moving `PLACED → PAID` is modeled in the state machine (`order-state-machine.ts`) but nothing in this phase triggers it automatically — a future "Payments" phase wires a real Razorpay order + webhook that calls that transition, the same boundary already established for bidding→payment in Q-25 ("payment for an accepted bid is intentionally unplugged").
4. **`order_vendor_groups` is not modeled as a separate table.** The spec's table was 1:1 with `(orders.checkout_id, orders.vendor_id)` and existed only to express "one order per vendor per checkout" as a constraint. `@@unique([checkoutId, vendorId])` directly on `Order` expresses the identical guarantee with one fewer table and one fewer join on every "orders for this checkout" query.

## Consequences
- Coupon/GST/platform-fee rates entered through a future admin UI need a `%` → basis-points conversion at the input boundary (`Math.round(percent * 100)`), documented once in `pricing.ts` rather than scattered.
- A checkout retried with the same idempotency key is a true no-op (same order IDs returned, zero new rows) — this is also what the "duplicate checkout" test asserts directly.
- Platform fee and GST rates ship with placeholder defaults seeded into `system_settings` (see `prisma/seed.ts`), clearly flagged as pending the client's CA/commercial confirmation (Q-19/Q-20) — not invented production values.

## Alternatives considered
- **Prisma `Decimal` for rates** — rejected: pulls `Decimal.js` semantics into money-adjacent code paths that ADR-0002 deliberately kept out, for a value (a rate) that's exactly as representable as integer basis points with zero precision loss.
- **Idempotency key on a `payments` row** — rejected for this phase since no `payments` row exists yet; revisit when the payment-gateway phase lands (it will likely need its *own* idempotency key for the capture call, independent of this one for order creation).
- **Keep `order_vendor_groups` as specified** — rejected as redundant with a unique constraint already available on `orders` itself; would be reconsidered only if a future need arises for metadata specific to "this vendor's slice of this checkout" that doesn't belong on `Order`.
