import { msg } from "@/i18n/locales";
/**
 * Advertisement rules — pure, no I/O, unit-tested directly (tests/unit/ad-rules.test.ts).
 * The service layer applies each rule inside one atomic database update.
 */

export type AdStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface AdFacts {
  status: AdStatus;
  isActive: boolean;
}

/** An ad is shown on the home page only when staff approved it and the vendor has not paused it. */
export function isShowing(ad: AdFacts): boolean {
  return ad.status === "APPROVED" && ad.isActive;
}

/** What the vendor sees next to an ad. */
export function adStateLabel(ad: AdFacts): string {
  if (ad.status === "PENDING") return msg("Waiting for approval");
  if (ad.status === "REJECTED") return msg("Not approved");
  return ad.isActive ? msg("Showing on the home page") : msg("Paused");
}

/** Only an ad waiting for review can be approved. */
export function canApprove(ad: AdFacts): { ok: boolean; message?: string } {
  if (ad.status === "APPROVED") return { ok: false, message: "This ad is already approved." };
  if (ad.status === "REJECTED") {
    return { ok: false, message: "This ad was not approved. The vendor has to edit it first." };
  }
  return { ok: true };
}

/** Staff can turn down an ad that is waiting, or take down one that is showing. */
export function canReject(ad: AdFacts): { ok: boolean; message?: string } {
  if (ad.status === "REJECTED") return { ok: false, message: "This ad is already not approved." };
  return { ok: true };
}

/** The vendor can pause or resume only an approved ad; a pending or rejected one is not showing anyway. */
export function canPause(ad: AdFacts): { ok: boolean; message?: string } {
  if (ad.status !== "APPROVED") {
    return { ok: false, message: "Only an approved ad can be paused or resumed." };
  }
  return { ok: true };
}

export const MAX_ACTIVE_ADS_ON_HOME = 4;
