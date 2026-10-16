/**
 * Pure member-id / referral-path formatting — see docs/database-tables.md §1
 * (`member_profiles.member_id`, `.referral_path`) and
 * docs/adr/0003-referral-tree-model.md. No I/O, unit-tested directly.
 */

/**
 * A member's ID is a 10-digit number, and it is also the Referral ID they share (one number, not two).
 * It is worked out from the database sequence with a fixed one-to-one mapping, so two members can
 * never get the same ID, no lookup or retry is needed, and the numbers do not run 1, 2, 3 in the open.
 *
 * The mapping is `(seq * MULTIPLIER + OFFSET) mod SPAN`, moved up so the result always has ten digits
 * and never starts with 0. MULTIPLIER is odd and divisible by neither 3 nor 5, so it has no common factor
 * with SPAN (9 x 10^9 = 2^9 x 3^2 x 5^9), which is what makes the mapping one-to-one.
 */
const MEMBER_ID_MIN = 1_000_000_000n;
const MEMBER_ID_SPAN = 9_000_000_000n;
const MEMBER_ID_MULTIPLIER = 2_654_435_761n;
const MEMBER_ID_OFFSET = 1_234_567_891n;

/** The ID format everywhere a member or referral ID is typed or checked. */
export const MEMBER_ID_PATTERN = /^\d{10}$/;

/** `42n` -> a 10-digit number such as `"3571025603"`. The same sequence always gives the same ID. */
export function formatMemberId(memberSeq: bigint): string {
  if (memberSeq < 0n || memberSeq >= MEMBER_ID_SPAN) {
    throw new RangeError("Member sequence is outside the range that fits a 10-digit ID.");
  }
  const mapped = (memberSeq * MEMBER_ID_MULTIPLIER + MEMBER_ID_OFFSET) % MEMBER_ID_SPAN;
  return (MEMBER_ID_MIN + mapped).toString();
}

/**
 * ltree labels only allow `[A-Za-z0-9_]`, so a UUID (which has hyphens)
 * can't be used verbatim as a path segment. Stripping hyphens keeps this
 * column already in the exact format the real `ltree` migration (Phase 6)
 * will need — see the schema comment on MemberProfile.referralPath.
 */
export function referralPathSegment(memberProfileId: string): string {
  return memberProfileId.replace(/-/g, "");
}

/** Root member (no referrer): path is just their own segment. */
export function buildReferralPath(parentPath: string | null, memberProfileId: string): string {
  const segment = referralPathSegment(memberProfileId);
  return parentPath ? `${parentPath}.${segment}` : segment;
}
