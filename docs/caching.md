# Just Reference — Caching Strategy (Phase 0)

## 1. Principle

Cache aggressively where staleness is harmless or trivially correctable (public catalog pages, category lists); cache never, or only as a UI-responsiveness layer with a hard refetch, where staleness could mean acting on wrong money data (wallet balance, order status, commission ledger). Every cache in this system has an explicit, documented invalidation trigger — nothing is cached "until it feels stale."

## 2. Cache layers

| Layer | What | TTL / invalidation |
|---|---|---|
| Next.js full-route cache / static generation | Public marketing pages, blog listing, category pages | Revalidated on publish/category-change via `revalidatePath`/`revalidateTag`, not time-only |
| Next.js data cache (`fetch` cache / `unstable_cache` equivalent) | Product/service/project detail pages (public, read-heavy) | Tagged by entity ID (`product:{id}`); invalidated on approval/update/delete of that listing |
| TanStack React Query (client) | Any authenticated screen's server data (orders, wallet, referrals, notifications) | Short `staleTime` (seconds, not minutes) for anything financial; invalidated explicitly after a mutation (`queryClient.invalidateQueries`) and by Supabase Realtime pings (see [api.md §9](api.md#9-realtime-channels-supabase-realtime)) — realtime is a "go refetch now" signal, not a data payload |
| Database query result cache | None by default | Not introduced in Phase 1; if a specific read (e.g., commission-rule lookup during checkout, called on every order) becomes a hot path, add a narrowly-scoped, short-TTL cache for that one query with an explicit invalidation hook on `commission_rules` writes — not a general-purpose cache layer |
| CDN (Vercel Edge / Supabase Storage) | Public images, banners, static assets | Long TTL + content-hashed filenames (cache-busting via URL change, not header expiry, for anything that can change) |

## 3. What is **never** cached server-side beyond request scope

- `wallets.balance`, `commission_ledger` status, `payout_requests` status, `orders.status` — every read of these for a financial decision (e.g., "does this member have enough balance to request this payout") goes to the database inside the same transaction that acts on it, never a cached value (see [financial-ledger.md](financial-ledger.md) §4's concurrency discussion — a cached balance read would reintroduce exactly the race conditions the row-locking there prevents).
- KYC/PAN/bank details — never cached, always fetched fresh with a fresh authorization check (see [security.md](security.md) §7).
- `commission_rules`/`tds_rules` **active version** lookup — cached client-side (React Query, short `staleTime`) for display purposes only; the actual commission/TDS calculation at order-completion time re-queries the database directly rather than trusting a cached rule set, since a rule change must take effect on the very next qualifying order, not after a cache TTL expires.

## 4. Invalidation triggers (explicit table)

| Cached thing | Invalidated by |
|---|---|
| Product/service/project detail page | Listing approved/updated/archived (`ListingApproved`/`ListingUpdated` event → `revalidateTag('product:{id}')`) |
| Category listing page | Category add/remove/rename |
| Blog post page | Publish/edit/archive |
| Member's order list (React Query) | Order placed, order status changed (own realtime channel ping) |
| Member's wallet page (React Query) | Wallet credit/debit (own realtime channel ping), explicit invalidation right after a top-up/payout mutation the member themselves triggered |
| Notification bell (React Query) | New notification (own realtime channel ping) |
| Admin commission-rule list | Rule created/activated |

## 5. Why not Redis/a shared cache layer in Phase 1

At the target scale (~10,000 users, ~1,000 orders/day per Q-46), Next.js's built-in data cache plus React Query's client-side cache plus Postgres's own query planning is sufficient — introducing a shared Redis cache adds an operational component (another service to run, another place data can go stale relative to Postgres) that isn't justified yet. Rate limiting (see [security.md](security.md) §9) is the one place a Redis-compatible store (Upstash) is already planned, because rate-limit counters genuinely need to be shared across serverless instances; that store is not reused as a general application cache, to keep its purpose (and failure blast radius) narrow.
