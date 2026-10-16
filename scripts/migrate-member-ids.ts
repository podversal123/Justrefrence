/**
 * One-off: gives every existing member the new 10-digit ID (the same number is the Member ID and the
 * Referral ID). Members created from now on get theirs automatically.
 *
 *   npx tsx --conditions=react-server --env-file=.env --env-file=.env.local scripts/migrate-member-ids.ts          (shows what would change)
 *   npx tsx --conditions=react-server --env-file=.env --env-file=.env.local scripts/migrate-member-ids.ts --apply  (does it)
 *
 * Safe to run twice: a member who already has a 10-digit ID is skipped. All changes happen in one
 * transaction, so either every member is updated or none is. Only member_profiles.member_id and
 * .referral_code change; the referral tree uses internal ids and is not touched.
 * Old referral links such as /register?ref=JR-000007 stop working after this.
 */
import { prisma } from "@/server/lib/prisma";
import { MEMBER_ID_PATTERN, formatMemberId } from "@/server/domain/identity/member-id";

async function main() {
  const apply = process.argv.includes("--apply");
  const members = await prisma.memberProfile.findMany({
    select: { id: true, memberSeq: true, memberId: true, referralCode: true },
    orderBy: { memberSeq: "asc" },
  });

  const changes = members
    .map((m) => ({ ...m, next: formatMemberId(m.memberSeq) }))
    .filter((m) => !(m.memberId === m.next && m.referralCode === m.next));

  const taken = new Set(
    members.filter((m) => m.memberId && MEMBER_ID_PATTERN.test(m.memberId)).map((m) => m.memberId),
  );
  const clashes = changes.filter((m) => taken.has(m.next) && m.memberId !== m.next);
  if (clashes.length > 0)
    throw new Error(`New IDs clash with existing ones: ${clashes.map((c) => c.next).join(", ")}`);

  console.log(`${members.length} members, ${changes.length} to change`);
  for (const m of changes)
    console.log(`  ${m.memberId ?? "-"} / ${m.referralCode ?? "-"}  ->  ${m.next}`);

  if (!apply) {
    console.log("Nothing changed. Run again with --apply to update.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    for (const m of changes) {
      await tx.memberProfile.update({
        where: { id: m.id },
        data: { memberId: m.next, referralCode: m.next },
      });
    }
  });
  console.log(`Updated ${changes.length} members.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
