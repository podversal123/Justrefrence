# Just Reference — Security Model & Checklist (Phase 0)

## 1. Threat model summary

This platform moves real money (wallet, commissions, payouts) and holds regulated personal/financial data (PAN, bank details, GSTIN, KYC). The two highest-value attack targets are: (a) forging or replaying a payment/webhook to credit money that wasn't paid, and (b) escalating privilege or bypassing ownership checks to read/move another member's money or KYC data. Security controls below are prioritized accordingly; catalog/blog/UI-level issues are lower severity by comparison.

## 2. Authentication

- Supabase Auth issues the session (JWT, HttpOnly cookie via `@supabase/ssr`, `SameSite=Lax`, `Secure` in production).
- Email + password, plus email OTP and mobile OTP as alternate factors. WhatsApp OTP (MSG91) is a custom flow: code is generated server-side, sent via MSG91 WhatsApp API, verified server-side against a **hashed** stored code (`otp_verifications.code_hash`), and only then does the server mint/exchange for a Supabase session — the raw OTP never determines auth on the client side.
- OTP codes: 6 digits, expire in 5 minutes (default, confirm with client), single-use, rate-limited per destination (max N requests / 15 min) and per IP, with exponential backoff on repeated verify failures. Raw OTP values are **never logged**.
- Password policy: minimum length/complexity enforced server-side (Supabase Auth config), breach-list check (HaveIBeenPwned range API) at signup/reset if feasible.
- Failed login protection: progressive lockout after N failed attempts per account + per IP; every failed attempt is an `audit_logs` entry.
- Session expiry + idle auto-logout per Q-37 (default 30 minutes idle).
- Two-step verification: mandatory for every `ADMIN`/`FINANCE`/`SUPPORT`/`SUPER_ADMIN` login from day one (already true of the live demo; Q-33 leaves member 2FA open — default off at launch, TOTP-based when enabled).
- Referrer/Member ID login: Member ID is a display identifier, not a credential; login itself is always by email or verified mobile number (Q-32).

## 3. Authorization

Covered in full in [rbac.md](rbac.md). Security-relevant summary:

- Server-side enforcement only. Every Server Action/Route Handler calls the shared `authorize()` helper — no route is exempt "because the UI already hides it."
- Supabase Row-Level Security is enabled on every table as **defense-in-depth**, deny-by-default, even though the app's Prisma client uses the service role and doesn't depend on RLS for its own logic. This protects against a bug that bypasses the service layer (e.g., a future direct-from-client Supabase call) from becoming a data breach.
- Resource ownership is checked using the authenticated session's `user_id`, never a client-supplied `user_id`/`vendor_id` field in the request body.
- Vendors cannot read/mutate another vendor's products, orders, or payouts — enforced by ownership predicate, tested explicitly (see [testing.md](testing.md)).

## 4. Input validation

- Every Server Action and Route Handler validates its input with a Zod schema **before** touching the service layer. Schemas live in `src/lib/schemas` and are shared between client-side form validation and server-side enforcement — never duplicated by hand.
- File uploads: MIME-type allowlist (checked by content sniffing, not just file extension), max size per upload type (e.g., 5MB for KYC docs, 2MB for product images), image re-encoding on the server before storage (strips EXIF/embedded scripts, normalizes format) rather than trusting the uploaded bytes as-is.
- No SQL injection surface: Prisma parameterizes all queries; raw SQL (`$queryRaw`) is avoided outside a short allowlist of documented, reviewed exceptions (e.g., the `ltree` referral queries), each with an inline comment explaining why raw SQL was necessary and confirming it's parameterized.

## 5. Payment security (Razorpay)

- **Never** trust `amount`, `status`, or `order_id` fields sent from the browser after a payment. The browser only tells the server "the user attempted payment X" — the server re-fetches/verifies the actual outcome.
- Client-side Razorpay checkout returns a `razorpay_payment_id` + `razorpay_order_id` + `razorpay_signature`. Server verifies the HMAC signature using the Razorpay key secret before treating the payment as successful.
- Webhook endpoint (`/api/webhooks/razorpay`) independently verifies the webhook signature header against the raw request body (not the parsed JSON, since re-serialization can change byte-for-byte content and break HMAC verification).
- Webhook processing is idempotent: `payment_events` has a unique constraint on `(provider, event_id)`; a replayed webhook is acknowledged (200 OK) but produces no second side effect.
- Order/wallet/commission state changes only happen from the **server-confirmed** payment event path (webhook or server-side verified redirect callback) — the "payment succeeded" toast the user sees is UI feedback, not the trigger for the ledger write.
- All webhook processing is logged (`payment_events` + `audit_logs`) and designed to be safely retried by the provider (returns 200 once durably recorded, even if downstream processing is deferred to a queue).

## 6. Secrets management

- No secret (API keys, Razorpay key secret, MSG91 auth key, Supabase service role key, Resend API key, encryption keys) is ever present in client-shipped code or `NEXT_PUBLIC_*` env vars.
- `.env.example` documents every required variable name with a placeholder and a one-line description — never a real value. See [environment.md](environment.md).
- Production secrets live in Vercel/Supabase project environment variable stores, scoped per environment (dev/staging/prod), not committed to git.
- Encryption-at-rest for specific sensitive columns (bank account number, Aadhaar if ever collected — currently the plan is to **not** store Aadhaar numbers, per Q-38's suggested default) uses an application-layer envelope: a data-encryption key stored as a secret, not the Supabase service role key.

## 7. Sensitive data handling (KYC / PII)

- Sensitive fields: PAN, bank account number, GSTIN, KYC documents.
- **Never** returned in full by list/collection APIs — list endpoints return masked forms only (e.g. `PAN: ABCDE****F`, `Bank: ******1234`). Full values are returned only by a dedicated, permission-gated single-resource endpoint (`member:read:any` + explicit KYC-view permission), and every such access is written to `audit_logs`.
- Masking is applied server-side, in the service layer response mapper — never "hide it in the frontend."
- Aadhaar numbers are **not stored** by default (Q-38 default) — if the client confirms Aadhaar is required, it is added as an explicitly-encrypted column with the same masking discipline, not a plain-text field.
- Minimum-data principle: fields not required by an active business rule are not collected. KYC document checking is manual (admin review), per Q-38's default — no automated KYC verification vendor is integrated in Phase 1 unless confirmed.

## 8. Logging discipline

**Never logged, anywhere, in any environment:** passwords, OTP codes (raw), Razorpay/MSG91/Resend API keys or secrets, wallet PIN, raw e-pin codes, full PAN/bank account/Aadhaar, full Supabase service role key, session JWTs.

- E-pins are stored and looked up by hash (`code_hash`) exactly like passwords; only a masked last-4 (`code_last4`) is ever shown in support/admin tooling.
- Structured logs use a redaction layer (allowlist of loggable fields per event type) rather than trusting each call site to remember what not to log.
- Error responses to clients never include stack traces or raw DB error messages — see the error envelope in [api.md](api.md); full technical detail goes to server-side logs only, tagged with a request/correlation ID the client-visible error also carries, so support can cross-reference without exposing internals.

## 9. Transport & headers

- HTTPS-only in production (HSTS enabled); local dev may use HTTP.
- Cookies: `HttpOnly`, `Secure` (prod), `SameSite=Lax` (Strict is not used because email-link/OTP flows and referral links can involve cross-site navigation into the app).
- CSRF: Server Actions get Next.js's built-in Origin-header verification; Route Handlers that accept state-changing requests from a browser session (not just webhooks/API keys) require a matching Origin/Referer or a CSRF token for any endpoint not called exclusively via `fetch` with same-site credentials.
- Security headers via Next.js middleware: `Content-Security-Policy` (script-src limited to self + explicitly allowlisted providers — Razorpay checkout script, etc.), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` restricting camera/mic/geolocation to none by default.
- Rate limiting on: OTP request/verify, login, password reset, payout request, coupon redemption attempts, and all public-facing Route Handlers — implemented at the edge (Vercel/middleware) with a sliding-window store (Upstash Redis or Supabase-backed), not in-memory per-instance counters (serverless instances don't share memory).

## 10. Audit logging

Immutable `audit_logs` entries for every sensitive operation: login, failed login, password change, role change, member block/unblock, commission rule change, wallet transaction, payout approval/rejection, payment webhook processed, refund, e-pin generation/redemption, KYC field change, settings change, admin actions on another user's data, referral repoint. Each entry captures actor, action, entity type+id, before/after snapshot (redacted per §8), IP, user agent, timestamp. `audit_logs` has no `UPDATE`/`DELETE` grant for the application role — corrections are new rows, same pattern as the financial ledgers.

## 11. Security checklist (Phase 0 gate — re-verified at end of every phase)

- [ ] Auth: email/mobile/WhatsApp OTP flows implemented with hashed OTP storage and rate limits
- [ ] RBAC: `authorize()` helper wired into every protected Route Handler/Server Action; no route relies on UI-only hiding
- [ ] RLS enabled (deny-by-default) on every Supabase table
- [ ] Zod validation on every mutating endpoint
- [ ] File upload MIME/size validation + server-side re-encoding
- [ ] Razorpay signature verification (checkout callback **and** webhook) implemented and tested with an invalid-signature case
- [ ] Webhook idempotency enforced via unique constraint, tested with a replayed event
- [ ] No client-supplied amount/status ever written to a financial table without server recomputation
- [ ] Secrets only in server-side env vars; `.env.example` has no real values
- [ ] PAN/bank/GSTIN masked in all list/collection responses; full value access is audited
- [ ] Aadhaar not stored, or stored encrypted with the same masking discipline if confirmed otherwise
- [ ] Logging redaction layer in place; confirmed no raw OTP/e-pin/PIN/secret ever reaches logs (spot-checked per module)
- [ ] Security headers + CSP configured in middleware
- [ ] CSRF protection on state-changing Route Handlers
- [ ] Rate limiting on OTP, login, password reset, payout, coupon redemption, public API
- [ ] Immutable audit log covers every action in the list in §10, verified with an insert-only DB grant
- [ ] Idle session timeout enforced server-side, not just client-side
- [ ] Independent third-party security test completed before go-live (per the Live Testing & Production Plan §4/§14) and findings resolved or accepted in writing

## 12. Deferred / explicitly not built pending confirmation

Per the client's own Live Testing & Production Plan §15, these carry real legal/security weight and are **not** implemented until confirmed:

- Member-to-member wallet transfers (Q-10) — potential RBI prepaid-instrument implications.
- "Investment income" / returns on deposits (Q-14) — potential deposit-taking legal exposure; requires the client's lawyer's written view before any code is written.
- Automated KYC verification beyond manual admin review (Q-38).
- A full legal review of the referral/commission/e-pin/wallet model against direct-selling and money-circulation-scheme regulation (Q-39) is a **precondition**, not a nice-to-have, for enabling real payouts in production.
