# ADR-0007: `@react-pdf/renderer` for invoices, Puppeteer reserved for future full-report export

## Status
Accepted

## Context
The brief requires server-side invoice PDF generation (never client-trusted totals) and lists both `react-pdf` and Puppeteer as options. The live demo currently ships invoices as browser-printable HTML pages only (per the client's own status list — "Invoices are printable pages; you save them as PDF from the browser"), which the client has not yet confirmed is acceptable long-term.

## Decision
Generate invoice PDFs server-side using `@react-pdf/renderer`, called from the `invoicing` service after an order reaches an invoiceable state, using data recomputed/re-fetched server-side (never trusting any client-supplied total). The resulting PDF is stored in a private Supabase Storage bucket and served via a signed URL to authorized viewers only.

Puppeteer is not used for invoices, but is kept as the documented tool of choice if a future report (e.g., a rich, styled TDS/commission report with complex layout beyond what `react-pdf`'s primitives handle well) is needed — it is not provisioned or wired up until such a report is actually scoped.

## Consequences
- Invoices have a fixed, predictable layout (`react-pdf`'s component model), which is a good fit for a structured financial document and avoids the memory/cold-start overhead of running headless Chrome in a serverless function for every invoice.
- This resolves the open item in [business-rules.md](../business-rules.md) ("Server-generated invoice PDFs vs. printable HTML") in favor of server generation by default; the client should still explicitly confirm this is wanted for Phase 1 rather than assuming the demo's simpler approach carries forward.

## Alternatives considered
- **Puppeteer for all PDF generation** — rejected as the default: heavier runtime footprint per invoice, harder to keep fast/cheap on serverless functions at the "~1,000 orders/day" scale target (Q-46), better suited to occasional, complex report exports than high-volume structured documents.
- **Browser-print-only (current demo behavior)** — rejected as the default per the brief's explicit requirement that invoice generation is server-side and never client-trusted; kept documented as what the client should be told is changing, not silently dropped.
