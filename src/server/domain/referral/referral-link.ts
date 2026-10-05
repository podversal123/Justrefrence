/**
 * Pure referral-link formatting — no I/O. The referral CODE itself already
 * exists (MemberProfile.referralCode, Phase 4) and `/register?ref=` already
 * consumes it (also Phase 4) — this is just the shareable-URL half of that
 * existing mechanism.
 */
export function buildReferralLink(appBaseUrl: string, referralCode: string): string {
  const base = appBaseUrl.replace(/\/$/, "");
  return `${base}/register?ref=${encodeURIComponent(referralCode)}`;
}
