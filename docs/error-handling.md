# Just Reference — Error Handling Strategy (Phase 0)

Expands [api.md](api.md) §2–3 (the response envelope and common error codes) into the full strategy: error taxonomy, propagation through the layers, logging, and user-facing presentation.

## 1. Error taxonomy

| Layer | Error type | Example | Maps to |
|---|---|---|---|
| Validation | `ValidationError` (Zod) | Missing required field, malformed email | `422 VALIDATION_ERROR`, field-level `details` array |
| Authorization | `AuthenticationError`, `AuthorizationError` | No session, wrong role/permission, ownership mismatch, blocked account | `401 UNAUTHENTICATED` / `403 FORBIDDEN` / `403 ACCOUNT_BLOCKED` |
| Business rule | `DomainError` (one subclass per rule, e.g. `InvalidStateTransitionError`, `InsufficientBalanceError`, `ExpiredEpinError`) | Illegal order-status transition, wallet would go negative, expired coupon | `409 CONFLICT` / `409 INSUFFICIENT_BALANCE` / specific code |
| Not found | `NotFoundError` | Resource doesn't exist or isn't visible to this caller (ownership-filtered) | `404 NOT_FOUND` — deliberately the same response whether the resource truly doesn't exist or the caller just can't see it, to avoid leaking existence of another user's data |
| External integration | `ProviderError` (per provider — `RazorpayError`, `Msg91Error`, `ResendError`) | Razorpay API timeout, MSG91 send failure | `502`/`503` with a generic `error.code`, full provider error detail server-logged only |
| Unexpected | anything uncaught | Bug, DB connection drop | `500 INTERNAL_ERROR` |

Every `DomainError` subclass is defined in the owning module (`src/server/domain/{module}/errors.ts`), not in a shared generic-exception file — this keeps the business-rule vocabulary explicit and searchable (see [modules.md](modules.md)).

## 2. Propagation rule

- Domain/application services **throw** typed errors; they never return a `{success:false}` object themselves (that shape is constructed once, at the Route Handler/Server Action boundary).
- A single error-mapping function (`src/server/lib/error-response.ts`) catches thrown errors at that boundary, maps the error's class to an HTTP status + `error.code`, and constructs the envelope from [api.md §2](api.md#2-response-envelope). This is the only place `try/catch`-to-HTTP-response translation happens — no route hand-writes its own mapping.
- Prisma errors (e.g., a unique-constraint violation) are caught at the repository boundary and re-thrown as the relevant `DomainError` (e.g., a duplicate `coupons.code` insert becomes `DuplicateCouponCodeError`, not a raw Prisma `P2002` leaking upward) — callers above the repository layer never see a raw ORM exception.

## 3. What the client sees vs. what gets logged

- Client response: `error.code` (stable, machine-readable) + `error.message` (safe, user-presentable, no internal detail) + `meta.requestId`.
- Server log (structured, redacted per [security.md](security.md) §8): full stack trace, the original exception, relevant context (which service call, which entity ID — never full PII), tagged with the same `requestId` so a support agent or developer can correlate a user's bug report to the exact log line without the client ever seeing raw internals.
- **Never** sent to the client: stack traces, SQL text, Prisma error internals, provider (Razorpay/MSG91) raw error payloads, internal file paths.

## 4. User-facing presentation

- Validation errors: inline, field-level, from the same Zod schema the client-side form already validates against (so server errors and client errors speak the same field names).
- Authorization errors: a generic "you don't have access to this" or a redirect to login — never a message that confirms/denies whether a specific resource exists for another user.
- Business-rule errors: specific, actionable copy per `error.code` (e.g., `INSUFFICIENT_BALANCE` → "Your wallet balance is too low for this payout" — not a generic "something went wrong").
- Unexpected errors: a generic apology + `requestId` shown to the user ("if this keeps happening, quote this reference") so support can look it up without the user needing to explain what happened technically.

## 5. Retries & external providers

- Idempotency-safe operations (payment webhook processing, notification sends) may be retried automatically with backoff on a `ProviderError`; **money-affecting** operations are only retried when the operation itself is idempotent (see [payment-architecture.md](payment-architecture.md) §4) — a raw HTTP retry on a non-idempotent write is never performed blindly.
- A provider outage degrades gracefully per channel: e.g., if Resend is down, email queueing retries later but the triggering business transaction (order placed, commission released) still commits — notification failure never rolls back a financial write (see [notifications.md](notifications.md) §2).

## 6. Testing requirement

Every `DomainError` subclass has at least one test asserting it maps to the correct HTTP status/`error.code` (see [testing.md](testing.md)), and the unauthorized/forbidden/not-found test cases listed there double as error-handling tests, not just RBAC tests.
