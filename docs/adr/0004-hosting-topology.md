# ADR-0004: Hosting topology — Vercel + Supabase only (no separate backend service)

## Status
Accepted, with an explicit re-open trigger — **flagged to the client as part of Q-41 (stack confirmation)**

## Context
The source documents disagree with each other:

- `JustReference_Project_Proposal.pdf` §8 and `JustReference_Project_Report.pdf` §6 both specify: **"Hosting: Vercel (app) + Supabase Cloud (backend)"** — i.e., no separate backend service; Next.js Route Handlers/Server Actions running on Vercel serverless functions are the backend, talking directly to Supabase Postgres/Auth/Storage.
- `JustReference_Project_Cost.pdf` §3/§3.1, by contrast, lists **"Hosting - Application (Backend): Render (paid plan)"** as a required, non-optional line item separate from Vercel, with its own cost (~₹665/month base), and states "Both Vercel and Render are required for deployment — Vercel hosts the application/frontend, and Render hosts the backend."
- Consistent with the Cost doc, the **live demo is actually deployed at `just-reference.onrender.com`** — i.e., whatever was actually built runs on Render, not Vercel+Supabase-only as the Proposal/Report describe.

This is a genuine conflict between the documents describing the *intended* architecture and the documents describing *cost* and the *actual demo deployment*, and it materially affects the folder structure and layering rule in [architecture.md](../architecture.md) (whether "backend" means Vercel Route Handlers, or a distinct Node service).

## Decision
For this fresh rebuild, default to the **architecture the brief itself mandates**: Next.js Route Handlers and Server Actions on Vercel serverless functions *are* the backend; Supabase provides Postgres/Auth/Storage/Realtime. No separate Render (or equivalent) Node service is provisioned at the start of Phase 1.

This is chosen over blindly matching the live demo's Render deployment because:
1. It matches the explicit architecture rule the brief itself states ("Next.js server-side architecture... Route Handlers/Server Actions where appropriate").
2. It matches what the Proposal and Report — the documents that actually describe scope and design, as opposed to a cost estimate — say twice, independently.
3. A demo site being deployed to Render is plausibly an artifact of how *that* build's demo was hosted (e.g., convenience, a different framework choice, or a stopgap before the "real" architecture was finalized) rather than a deliberate architectural requirement — nothing in the Proposal, Report, or Workflow doc explains *why* a separate backend service would be needed.

## Re-open trigger
This decision is revisited (and Render, Railway, or a Vercel background/queue mechanism added) if, during Phase 1 build, any of the following becomes true:
- A background job genuinely needs to run longer than Vercel serverless function duration limits allow (e.g., a very large batch commission-recalculation or bulk TDS report job).
- A true persistent WebSocket requirement emerges that Supabase Realtime cannot cover.
- The client, upon reviewing this document, confirms Render (or another separate backend) was in fact an intentional requirement, not a Cost-doc drafting inconsistency.

## Consequences
- Simpler operational surface: one deployment target (Vercel) plus one managed data platform (Supabase), matching [deployment.md](../deployment.md).
- Cost estimate in `JustReference_Project_Cost.pdf` should be revisited with the client once this ADR is confirmed, since it removes the Render line item (~₹665–7,980/month) from the third-party cost table if accepted as written.
- Scheduled/cron-style jobs (e-pin expiry, commission release, wallet reconciliation) use Vercel Cron calling authenticated Route Handlers (`CRON_SECRET`), not a standalone worker process.

## Alternatives considered
- **Vercel (frontend) + Render (backend)**, matching the Cost doc and the live demo exactly — rejected as the default per the reasoning above, but kept as the documented fallback if the client confirms it was intentional.
- **Vercel + Supabase Edge Functions** for any workload that doesn't fit a Vercel serverless function — a lighter-weight alternative to a full Render service if the re-open trigger fires, worth considering before reaching for a separate Node backend.
