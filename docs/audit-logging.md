# Just Reference — Audit Logging Architecture (Phase 0)

Expands [security.md](security.md) §10 and the `audit_logs` table spec in [database-tables.md §13](database-tables.md#13-platform-settings-audit). This is the platform-wide accountability mechanism — every module writes to it, nothing reads it except `SUPER_ADMIN` (`audit:read`).

## 1. Single write path

```
audit.record({
  actorId,        // uuid | null (null only for genuine system/cron actions)
  action,         // e.g. 'PAYOUT_APPROVED', 'ROLE_ASSIGNED', 'COMMISSION_RULE_UPDATED'
  entityType,      // e.g. 'payout_requests'
  entityId,
  before,          // redacted snapshot, or null for a creation
  after,           // redacted snapshot, or null for a deletion
  ip,              // from the request context, when available
  userAgent,       // from the request context, when available
})
```

This is the **only** function that writes to `audit_logs`. It lives in the `audit` module ([modules.md](modules.md) §17) and is called from application services (not from repositories, and never from the UI layer) at the point a sensitive operation completes successfully — a failed/rejected operation is still logged (with `after=null` or a `result: 'DENIED'` marker in metadata) so denied attempts are visible too, per [security.md](security.md) §2's failed-login-attempt tracking and the brief's "unauthorized admin action" test case.

## 2. Immutability

- `audit_logs` has `INSERT` granted to the application role and **no** `UPDATE`/`DELETE` grant at all — not even for `SUPER_ADMIN` through the application. A correction (e.g., "the IP was misattributed") is a new row referencing the original, never an edit.
- No table in the schema is permitted to `TRUNCATE`/bulk-delete `audit_logs`, including data-retention tooling — retention/archival (if ever needed at extreme scale) exports to cold storage rather than deleting, since financial-audit obligations (Q-40) apply to this table too.

## 3. What is logged (mandatory list, from the brief + this project's own additions)

| Category | Actions |
|---|---|
| Auth | Login, failed login, password change, password reset, OTP verification failure (rate-limit-triggered ones specifically), 2FA enrollment/disable |
| RBAC | Role assigned/revoked, permission bundle changed, referral repointed |
| Member lifecycle | Member blocked/unblocked, vendor approved/rejected/suspended, KYC field changed |
| Catalog | Listing approved/rejected (not routine create/update — see §5) |
| Financial rules | Commission rule created/activated, TDS rule created/activated, GST rule changed, platform fee changed, coupon created |
| Financial events | Every `wallet_transactions` insert, every `commission_ledger` insert, payout requested/approved/rejected/paid, refund processed, e-pin generated/redeemed/revoked |
| Payments | Webhook processed (payment captured/failed/refunded) |
| Settings | System setting changed, maintenance mode toggled |
| Access to sensitive data | Full (unmasked) PAN/bank/KYC record viewed by staff, KYC document signed-URL issued (see [file-upload.md](file-upload.md) §5) |
| Denied actions | Any `authorize()` failure on a sensitive permission (`payout:approve`, `commission_rule:update`, `member:block`, etc.) — not every 403 platform-wide, to avoid drowning the log, but every one on the sensitive-permission list |

## 4. What is *not* logged here (by design, not oversight)

- High-volume, non-sensitive reads (browsing catalog, viewing own order list) — would drown the signal; ordinary access patterns are covered by infrastructure-level request logs, not `audit_logs`.
- Routine catalog CRUD by a vendor on their own listing (create/edit a product) — only the **approval decision** (an admin action affecting another party) is audit-logged; the vendor's own edit history, if ever needed, belongs in a lighter-weight table, not the security-audit log.
- Anything containing a raw secret (see redaction, §5) — the *fact* that a secret-bearing action happened is logged; the secret itself never is.

## 5. Redaction

`before`/`after` snapshots pass through the same allowlist-based redaction layer described in [security.md](security.md) §8 before being written — a field not on that event type's allowlist is stripped, not merely masked, so a forgotten field can't leak a password/OTP/PIN/secret/full-PAN into an audit row. This means the redaction rule lives in one place (`src/server/domain/audit/redact.ts`), reused by every `audit.record()` call site, rather than trusted to each call site's discipline.

## 6. Query patterns supported

`audit:read` (SUPER_ADMIN only) supports: by entity (`entity_type + entity_id` — "show me everything that happened to this payout request"), by actor (`actor_id` — "show me everything this admin did"), and by time range. All three are covered by the indexes in [database-tables.md](database-tables.md#13-platform-settings-audit): `(entity_type, entity_id)`, `actor_id`, `created_at`. Cursor pagination applies here too, per [api.md](api.md) §4 — audit logs grow without bound and are never fetched as a full table.

## 7. Relationship to per-entity history tables

`order_status_history` (orders), `commission_ledger`/`wallet_transactions`/`tds_transactions`/`payout_transactions` (money) are each **domain-specific** append-only histories that exist independently of `audit_logs` — they answer "what is the financial/status history of this specific entity" efficiently, scoped to their own module. `audit_logs` is the **cross-cutting** security/accountability log — "who did what, across the whole platform." The two are complementary, not duplicative: a payout approval produces both a `payout_requests.status` transition (queryable by anyone with `payout:read` on that resource) **and** an `audit_logs` row (queryable only by `SUPER_ADMIN`, searchable by actor across all resources).
