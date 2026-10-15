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

/** A short plain-language line saying where a wallet entry came from. Pass the result through `t()`. */
const DESCRIPTIONS: Record<string, string> = {
  COMMISSION: msg("Earning from a referral order"),
  REWARD: msg("Reward from Just Reference"),
  PAYOUT_REQUEST: msg("Withdrawal to your bank account"),
  MANUAL_TOPUP: msg("Money added by the Just Reference team"),
};

export function transactionDescription(type: string, referenceType: string): string {
  return DESCRIPTIONS[referenceType] ?? transactionLabel(type);
}

export function transactionLabel(type: string): string {
  return (
    TRANSACTION_LABELS[type] ??
    type
      .split("_")
      .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
      .join(" ")
  );
}
