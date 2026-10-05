// No "server-only" import — orchestration layer, same rationale as
// commission-service.ts.
import { getMemberProfileByUserId } from "@/server/repositories/identity/member-repository";
import {
  getDirectReferrals,
  getReferralHistory,
  getReferralTree,
} from "@/server/repositories/referral/referral-repository";
import { getCommissionSummary } from "@/server/repositories/commission/commission-repository";
import { buildReferralLink } from "@/server/domain/referral/referral-link";
import { NotFoundError } from "@/server/lib/errors";

/**
 * One-stop read model for the member-facing /referrals page — referral
 * code/link, direct list, tree, history, and commission reporting, all
 * scoped to the caller's own membership. See the Phase 6 brief's "referral
 * code / link / direct / indirect / tree / list / history / relationship /
 * reporting" requirement list.
 */
export async function getReferralDashboard(userId: string, appBaseUrl: string) {
  const memberProfile = await getMemberProfileByUserId(userId);
  if (!memberProfile || !memberProfile.referralCode) {
    throw new NotFoundError("No member profile found for this account.");
  }

  const [directReferrals, tree, history, commissionSummary] = await Promise.all([
    getDirectReferrals(memberProfile.id),
    getReferralTree(memberProfile.referralPath),
    getReferralHistory(memberProfile.id),
    getCommissionSummary(memberProfile.id),
  ]);

  return {
    memberId: memberProfile.memberId,
    referralCode: memberProfile.referralCode,
    referralLink: buildReferralLink(appBaseUrl, memberProfile.referralCode),
    directReferralCount: directReferrals.length,
    indirectReferralCount: Math.max(tree.length - directReferrals.length, 0),
    directReferrals,
    tree,
    history,
    commissionSummary,
  };
}
