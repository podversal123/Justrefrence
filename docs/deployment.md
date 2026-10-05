# Just Reference — Deployment (Phase 0)

## 1. Topology

See [ADR-0004](adr/0004-hosting-topology.md) for the full reasoning behind resolving the Vercel+Supabase-only vs. Vercel+Render conflict found in the source documents. Baseline:

```
                         ┌────────────────────┐
   Browser / Mobile ───▶ │  Vercel (Next.js)  │  Route Handlers + Server Actions = "the backend"
                         └─────────┬──────────┘
                                   │  Prisma (service role, server-only)
                                   ▼
                         ┌────────────────────┐
                         │  Supabase Cloud    │  Postgres, Auth, Storage, Realtime
                         └────────────────────┘
        ▲                          ▲                         ▲
        │                          │                         │
   Razorpay webhooks         MSG91 (SMS/WhatsApp)        Resend (email)
   → /api/webhooks/razorpay  → OTP send + delivery cb     → transactional email
```

No separate Node/Express backend service is provisioned for Phase 1. If a genuine need for a long-running or non-serverless process emerges (see ADR-0004's trigger list — e.g. a heavy queue worker that exceeds Vercel function duration limits), it is added later as its own ADR, not assumed up front.

## 2. Environments

| Environment | Purpose | Database | Payments | SMS/WhatsApp/Email |
|---|---|---|---|---|
| `local` | Developer machines | Local Supabase (Docker) or a dedicated dev Supabase project | Razorpay test mode | Provider sandbox/test mode, or console-logged in dev |
| `preview` | Vercel preview deployments per PR | Shared dev Supabase project (or branch DB if Supabase branching is enabled) | Razorpay test mode | Sandbox/test mode |
| `staging` | Pre-production rehearsal, mirrors prod config | Dedicated Supabase project | Razorpay test mode (switchable to live for final rehearsal per the client's Acceptance Testing phase) | Sandbox, switchable to live for final rehearsal |
| `production` | Live site (`justreference.in`) | Dedicated Supabase project (Pro plan, backups on) | Razorpay live mode | Live accounts |

Promotion is strictly `local → preview → staging → production`; no environment skips staging for a first-time feature that touches money.

## 3. Migrations

- Prisma Migrate, migrations checked into `prisma/migrations/`, applied via `prisma migrate deploy` in CI/CD — never `prisma db push` against staging/production.
- Every migration that touches a financial table requires a second reviewer on the PR (enforced by CODEOWNERS on `prisma/schema.prisma` and `prisma/migrations/**`), independent of general code review.
- Destructive migrations (column/table drops) require a documented rollback plan in the PR description before merge.

## 4. CI/CD (outline — implemented in Phase 1)

1. PR opened → typecheck, lint, unit tests, integration tests run.
2. Preview deployment created (Vercel) against the shared dev database.
3. Merge to `main` → staging deploy → `prisma migrate deploy` against staging → E2E smoke suite runs against staging.
4. Manual promotion staging → production (not automatic) — gated by the acceptance checklist in [testing.md](testing.md) and, for the very first production cutover, by the client's written sign-off per the six-phase production plan (Live Testing doc §14).
5. Production deploy runs `prisma migrate deploy` before traffic is routed to the new build (no request served against an unmigrated schema).

## 5. Backups & recovery

- Supabase Pro plan daily backups (point-in-time recovery enabled) — required per the client's own "done when" checklist ("Backups run, and a restore has been tested").
- A restore drill is performed at least once before go-live and the result documented.
- `audit_logs` and the financial ledger tables (`wallet_transactions`, `commission_ledger`, `payout_transactions`, `tds_transactions`) are included in backup scope with no special exclusion — they are the system's source of truth for money.

## 6. Rollback

- Application rollback: Vercel's instant rollback to a previous deployment.
- Database rollback: **forward-fix, not down-migration**, for any migration that has already run against production with live data — down-migrations on financial tables risk silent data loss. A broken migration is fixed by a new corrective migration, not by reversing the old one.

## 7. Domain & DNS

- `justreference.in` is already owned by the client (per the Workflow doc) — pointed to Vercel for the app and to the email provider (Resend/Supabase SMTP) for SPF/DKIM/DMARC records once DNS access is shared.

## 8. Maintenance mode

`maintenance_settings` (see [database.md](database.md) §13) drives a middleware-level check that serves a maintenance page to non-admin traffic while allowing `SUPER_ADMIN`/`ADMIN` through — used for planned downtime (e.g., a risky migration), toggled from the Super Admin panel (`maintenance:toggle` permission), and itself audit-logged.

## 9. Third-party account ownership (per Q-42)

All third-party accounts (Supabase, Razorpay, MSG91, Resend, Vercel) are created and owned by the client, with credentials shared to the dev team for setup — not owned by the development agency. This matches both the Workflow doc and the Live Testing doc's explicit requirement ("You own every account, and you hold the source code and admin guides" in the go-live checklist).
