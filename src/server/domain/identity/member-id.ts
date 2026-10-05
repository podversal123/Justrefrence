/**
 * Pure member-id / referral-path formatting — see docs/database-tables.md §1
 * (`member_profiles.member_id`, `.referral_path`) and
 * docs/adr/0003-referral-tree-model.md. No I/O, unit-tested directly.
 */

const MEMBER_ID_PREFIX = "JR-";
const MEMBER_ID_PAD = 6;

/** `42n` -> `"JR-000042"`. Mirrors the `JR-000482` example in the spec. */
export function formatMemberId(memberSeq: bigint): string {
  return `${MEMBER_ID_PREFIX}${memberSeq.toString().padStart(MEMBER_ID_PAD, "0")}`;
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
export function buildReferralPath(
  parentPath: string | null,
  memberProfileId: string,
): string {
  const segment = referralPathSegment(memberProfileId);
  return parentPath ? `${parentPath}.${segment}` : segment;
}
