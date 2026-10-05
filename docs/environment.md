# Just Reference — Environment Variables (Phase 0)

Full variable catalog for `.env.example` (see repo root). No real values are ever committed — this table documents name, purpose, and which environments need it. Server-only variables are never exposed via `NEXT_PUBLIC_*`.

| Variable | Scope | Purpose |
|---|---|---|
| `DATABASE_URL` | server | Prisma connection string (Supabase Postgres, pooled) |
| `DIRECT_URL` | server | Prisma direct connection (migrations, bypasses connection pooler) |
| `NEXT_PUBLIC_SUPABASE_URL` | client+server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | client+server | Supabase anon key (RLS-restricted, safe to expose) |
| `SUPABASE_SERVICE_ROLE_KEY` | server only | Full-access key used only inside Prisma/service-layer server code — never sent to the client, never used in a Route Handler that echoes input back |
| `RAZORPAY_KEY_ID` | server (public half used client-side for checkout widget) | Razorpay integration |
| `RAZORPAY_KEY_SECRET` | server only | Signature verification |
| `RAZORPAY_WEBHOOK_SECRET` | server only | Webhook signature verification |
| `MSG91_AUTH_KEY` | server only | SMS/OTP sending |
| `MSG91_SENDER_ID` | server only | DLT-registered sender ID |
| `MSG91_WHATSAPP_API_KEY` | server only | WhatsApp OTP/verification |
| `RESEND_API_KEY` | server only | Transactional email |
| `EMAIL_FROM_ADDRESS` | server only | Verified sending domain address |
| `APP_BASE_URL` | server (build-time) | Used to construct absolute links in emails/SMS (referral links, invoice links) |
| `SESSION_IDLE_TIMEOUT_MINUTES` | server | Default 30 (Q-37) — configurable without redeploy via `system_settings` in production, env var is the local-dev fallback |
| `WEBHOOK_QUEUE_SIGNING_SECRET` | server only | Internal signing for any queued/retried job payloads |
| `FIELD_ENCRYPTION_KEY` | server only | Application-layer encryption for bank account number / any future Aadhaar field (see [security.md](security.md) §6–7) |
| `CRON_SECRET` | server only | Authenticates Vercel Cron → `/api/cron/*` calls |
| `ENFORCE_HTTPS` | build time | Set to `1` when deploying to an HTTPS host other than Vercel. Turns on `Strict-Transport-Security` and CSP `upgrade-insecure-requests` (Vercel sets `VERCEL=1` automatically). Leave unset for local `npm run build && npm start` over `http://localhost`, otherwise redirects break with `ERR_SSL_PROTOCOL_ERROR`. |
| `RATE_LIMIT_REDIS_URL` | server only | Upstash/Redis-backed rate limiter store (OTP, login, payout, coupon endpoints) |
| `NODE_ENV` | server | `development` / `test` / `production` |
| `VERCEL_ENV` | server (auto-provided) | Used to select environment-specific behavior (e.g., force Razorpay test mode outside `production`) |

## Environment-specific values

| Variable | local | preview | staging | production |
|---|---|---|---|---|
| Razorpay mode | test | test | test (switchable near go-live) | live |
| SMS/WhatsApp | sandbox/console-logged | sandbox | sandbox | live |
| Email | sandbox/console-logged | sandbox | sandbox (or live for final rehearsal) | live |
| Database | local/dev Supabase | shared dev Supabase | dedicated staging Supabase | dedicated production Supabase (Pro plan, backups) |

## Rules

- `.env.example` lists every key above with a placeholder (`REPLACE_ME`) and a one-line comment — never a working credential, even a test one.
- Secrets are set per-environment in Vercel's Environment Variables UI and Supabase's project settings, not shared across environments.
- Any new integration (e.g., an automated payout provider if Q-12 changes) adds its keys here before the corresponding ADR/feature is implemented, not after.
