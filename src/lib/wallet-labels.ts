import { msg } from "@/i18n/locales";

/** What a wallet entry is called on screen. Pass the result through `t()`. */
const TRANSACTION_LABELS: Record<string, string> = {
  TOPUP: msg("Top-up"),
  COMMISSION: msg("Commission"),
  PAYOUT: msg("Payout"),
  REFUND: msg("Refund"),
  REWARD: msg("Reward"),
  TRANSFER: msg("Transfer"),
  ADJUSTMENT: msg("Adjustment"),
};

export function transactionLabel(type: string): string {
  return (
    TRANSACTION_LABELS[type] ??
    type
      .split("_")
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(" ")
  );
}
