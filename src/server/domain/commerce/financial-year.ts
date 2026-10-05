/**
 * Indian financial year (1 April – 31 March) helpers — see
 * docs/database-tables.md §4 (`invoices.financial_year`, e.g. `'2026-27'`).
 * Pure, no I/O.
 */
export function getFinancialYear(date: Date = new Date()): string {
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth(); // 0-indexed; 3 = April
  const startYear = month >= 3 ? year : year - 1;
  const endYearSuffix = ((startYear + 1) % 100).toString().padStart(2, "0");
  return `${startYear}-${endYearSuffix}`;
}

/**
 * `invoiceSeq` is the DB-assigned global autoincrement (collision-free
 * under concurrency) — see the schema comment on Invoice.invoiceSeq for why
 * this isn't a true per-financial-year gapless sequence yet.
 */
export function formatInvoiceNumber(financialYear: string, invoiceSeq: bigint): string {
  return `INV/${financialYear}/${invoiceSeq.toString().padStart(6, "0")}`;
}
