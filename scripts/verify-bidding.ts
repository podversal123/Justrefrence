/**
 * End-to-end verification of the bidding / reverse-auction service against the
 * REAL database (not mocks): concurrency, rules, anti-sniping, award, cancel.
 * Creates throwaway users/vendors/requirements (marker domain
 * @bidtest.justreference.test) and deletes them again, even on failure.
 *
 *   npx tsx --conditions=react-server --env-file=.env --env-file=.env.local scripts/verify-bidding.ts
 *
 * (`--conditions=react-server` lets the app's `server-only` imports load
 * outside Next; the env files must be loaded BEFORE the app's prisma client is
 * created, which is why they are passed as flags rather than via dotenv.)
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/server/lib/prisma";
import {
  awardBid,
  cancelRequirement,
  createRequirement,
  placeBid,
  withdrawBid,
} from "@/server/domain/bidding/bidding-service";

const DOMAIN = "@bidtest.justreference.test";
let passed = 0;
const failures: string[] = [];

function check(label: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${label}`);
  } else {
    failures.push(label);
    console.log(`FAIL  ${label}`, detail ?? "");
  }
}

async function expectReject(label: string, run: () => Promise<unknown>, messagePart?: string) {
  try {
    await run();
    check(label, false, "(expected a rejection, but it succeeded)");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    check(
      label,
      messagePart ? message.toLowerCase().includes(messagePart.toLowerCase()) : true,
      message,
    );
  }
}

const minutes = (n: number) => new Date(Date.now() + n * 60_000);

async function makeUser(name: string) {
  return prisma.user.create({
    data: {
      id: randomUUID(),
      email: `${name}-${randomUUID().slice(0, 8)}${DOMAIN}`,
      fullName: name,
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
}
async function makeVendor(name: string) {
  const user = await makeUser(name);
  const profile = await prisma.vendorProfile.create({
    data: {
      userId: user.id,
      businessName: `${name} Traders`,
      approvalStatus: "APPROVED",
      approvedAt: new Date(),
    },
  });
  return { user, profileId: profile.id };
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: DOMAIN } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  const reqs = await prisma.requirement.findMany({
    where: { buyerId: { in: userIds } },
    select: { id: true },
  });
  const reqIds = reqs.map((r) => r.id);
  await prisma.requirement.updateMany({
    where: { id: { in: reqIds } },
    data: { awardedBidId: null },
  });
  await prisma.bidRevision.deleteMany({ where: { bid: { requirementId: { in: reqIds } } } });
  await prisma.bid.deleteMany({ where: { requirementId: { in: reqIds } } });
  await prisma.requirement.deleteMany({ where: { id: { in: reqIds } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  await prisma.vendorProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

const base = {
  quantity: 10,
  unit: "pcs",
  itemKind: "PRODUCT" as const,
  categoryLabel: null,
  deliveryCity: null,
  estimatedValue: null,
};

async function main() {
  await cleanup(); // leftovers from an interrupted earlier run
  const buyer = await makeUser("buyer");
  const vendors = await Promise.all([1, 2, 3, 4, 5].map((n) => makeVendor(`vendor${n}`)));
  const [v1, v2, v3, v4, v5] = vendors as [
    (typeof vendors)[0],
    (typeof vendors)[0],
    (typeof vendors)[0],
    (typeof vendors)[0],
    (typeof vendors)[0],
  ];
  const bid = (v: typeof v1, requirementId: string, unitPrice: bigint, deliveryDays = 7) =>
    placeBid({
      requirementId,
      vendorProfileId: v.profileId,
      vendorUserId: v.user.id,
      unitPrice,
      deliveryDays,
      note: null,
    });

  // ---------------------------------------------------------------- reverse auction
  const ra = await createRequirement(buyer.id, {
    ...base,
    title: "Verification auction",
    description: "Auction used by verify-bidding.ts",
    type: "REVERSE_AUCTION",
    closesAt: minutes(30),
    minDecrement: 100n,
    autoExtendMinutes: 5,
  });

  const first = await bid(v1, ra.id, 1000n);
  check(
    "first bid is accepted and ranks L1",
    first.rank === 1 && first.isFirstBid && first.totalPrice === 10000n,
    first,
  );
  await expectReject(
    "an identical re-bid is refused",
    () => bid(v1, ra.id, 1000n),
    "same as your current",
  );
  await expectReject(
    "a price drop below the minimum decrement is refused",
    () => bid(v1, ra.id, 950n),
    "minimum decrement",
  );
  await expectReject(
    "a HIGHER price is refused in an auction",
    () => bid(v1, ra.id, 1200n),
    "lower",
  );
  const lowered = await bid(v1, ra.id, 900n);
  check("a valid lowering is accepted", lowered.totalPrice === 9000n);

  const second = await bid(v2, ra.id, 850n);
  check(
    "a rival undercutting takes L1 and the old leader is told (outbid)",
    second.rank === 1 && second.outbidVendorUserId === v1.user.id,
    second,
  );
  await expectReject(
    "the buyer cannot bid on their own requirement",
    () =>
      placeBid({
        requirementId: ra.id,
        vendorProfileId: v3.profileId,
        vendorUserId: buyer.id,
        unitPrice: 500n,
        deliveryDays: 5,
        note: null,
      }),
    "own requirement",
  );

  // five different vendors bidding at the same instant
  const burst = await Promise.allSettled([
    bid(v3, ra.id, 800n),
    bid(v4, ra.id, 700n),
    bid(v5, ra.id, 600n),
  ]);
  check(
    "3 simultaneous first bids all succeed",
    burst.every((r) => r.status === "fulfilled"),
    burst,
  );
  const active = await prisma.bid.count({ where: { requirementId: ra.id, status: "ACTIVE" } });
  check("exactly one live bid per vendor (5)", active === 5, active);

  // the SAME vendor racing against themselves: only one price change can win
  const race = await Promise.allSettled([1, 2, 3, 4, 5].map(() => bid(v2, ra.id, 700n)));
  const wins = race.filter((r) => r.status === "fulfilled").length;
  check(
    "5 simultaneous identical bids from one vendor -> exactly 1 succeeds",
    wins === 1,
    race.map((r) => r.status),
  );

  const revisions = await prisma.bidRevision.count({ where: { bid: { requirementId: ra.id } } });
  // v1: 1000, 900 = 2; v2: 850, 700 = 2; v3, v4, v5 = 1 each -> 7
  check(
    "every accepted price is recorded in the append-only history (7 rows)",
    revisions === 7,
    revisions,
  );

  const rows = await prisma.bid.findMany({
    where: { requirementId: ra.id, status: "ACTIVE" },
    select: { vendorId: true, totalPrice: true },
  });
  const lowest = rows.reduce((a, b) => (a.totalPrice <= b.totalPrice ? a : b));
  check(
    "the L1 total is the true minimum (v5 at 600/unit = 6000)",
    lowest.vendorId === v5.profileId && lowest.totalPrice === 6000n,
    lowest,
  );

  // anti-sniping
  await prisma.requirement.update({ where: { id: ra.id }, data: { closesAt: minutes(2) } });
  const sniped = await bid(v1, ra.id, 500n);
  const afterSnipe = await prisma.requirement.findUniqueOrThrow({
    where: { id: ra.id },
    select: { closesAt: true },
  });
  const extensionMin = (afterSnipe.closesAt.getTime() - Date.now()) / 60_000;
  check(
    "a bid in the last minutes extends the auction to ~5 minutes from now",
    sniped.extendedTo !== null && extensionMin > 4.5 && extensionMin <= 5.1,
    extensionMin,
  );

  // closing, then rules that depend on closed
  await expectReject(
    "awarding while bidding is open is refused",
    () => awardBid({ requirementId: ra.id, bidId: sniped.bidId, buyerId: buyer.id }),
    "still open",
  );
  await prisma.requirement.update({ where: { id: ra.id }, data: { closesAt: minutes(-1) } }); // row still says OPEN
  await expectReject(
    "a bid after the deadline is refused even though the row still says OPEN",
    () => bid(v3, ra.id, 100n),
    "closed",
  );
  await expectReject(
    "a stranger cannot award someone else's requirement",
    () => awardBid({ requirementId: ra.id, bidId: sniped.bidId, buyerId: v1.user.id }),
    "not found",
  );
  const awarded = await awardBid({ requirementId: ra.id, bidId: sniped.bidId, buyerId: buyer.id });
  check(
    "the buyer awards after the deadline",
    awarded.winnerUserId === v1.user.id && awarded.rejectedUserIds.length === 4,
    awarded,
  );
  const statuses = await prisma.bid.groupBy({
    by: ["status"],
    where: { requirementId: ra.id },
    _count: { _all: true },
  });
  const byStatus = Object.fromEntries(statuses.map((s) => [s.status, s._count._all]));
  check(
    "1 ACCEPTED and 4 REJECTED",
    byStatus["ACCEPTED"] === 1 && byStatus["REJECTED"] === 4,
    byStatus,
  );
  await expectReject(
    "a second award is refused",
    () => awardBid({ requirementId: ra.id, bidId: second.bidId, buyerId: buyer.id }),
    "already",
  );
  const dbReq = await prisma.requirement.findUniqueOrThrow({
    where: { id: ra.id },
    select: { status: true, awardedBidId: true },
  });
  check(
    "requirement is AWARDED to the winning bid",
    dbReq.status === "AWARDED" && dbReq.awardedBidId === sniped.bidId,
    dbReq,
  );

  // ---------------------------------------------------------------- sealed tender
  const tender = await createRequirement(buyer.id, {
    ...base,
    title: "Verification tender",
    description: "Tender used by verify-bidding.ts",
    type: "TENDER",
    closesAt: minutes(60),
    minDecrement: 0n,
    autoExtendMinutes: 0,
    estimatedValue: 20000n,
  });
  await expectReject(
    "a bid above the buyer's maximum budget is refused",
    () => bid(v1, tender.id, 2001n),
    "budget",
  );
  const t1 = await bid(v1, tender.id, 2000n);
  check("tender bid at exactly the budget is accepted", t1.totalPrice === 20000n);
  const t2 = await bid(v1, tender.id, 1900n);
  check("a tender may be revised to ANY price while open", t2.totalPrice === 19000n);
  await withdrawBid({ requirementId: tender.id, vendorProfileId: v1.profileId });
  check(
    "a tender bid can be withdrawn while open",
    (await prisma.bid.findFirstOrThrow({ where: { requirementId: tender.id } })).status ===
      "WITHDRAWN",
  );
  const t3 = await bid(v1, tender.id, 1800n);
  check(
    "a withdrawn tender bid can be re-submitted",
    t3.totalPrice === 18000n && t3.isFirstBid,
    t3,
  );
  await expectReject(
    "an auction bid cannot be withdrawn",
    () => withdrawBid({ requirementId: ra.id, vendorProfileId: v2.profileId }),
    "reverse auction",
  );

  // ---------------------------------------------------------------- cancel
  const cancelled = await cancelRequirement({
    requirementId: tender.id,
    buyerId: buyer.id,
    reason: "No longer needed",
  });
  check(
    "cancelling releases the bidder",
    cancelled.bidderUserIds.length === 1 && cancelled.bidderUserIds[0] === v1.user.id,
    cancelled,
  );
  await expectReject(
    "a cancelled requirement takes no more bids",
    () => bid(v2, tender.id, 100n),
    "closed",
  );
  await expectReject(
    "cancelling twice is refused",
    () => cancelRequirement({ requirementId: tender.id, buyerId: buyer.id, reason: "again" }),
    "already cancelled",
  );
  await expectReject(
    "an awarded requirement cannot be cancelled",
    () => cancelRequirement({ requirementId: ra.id, buyerId: buyer.id, reason: "too late" }),
    "awarded",
  );
}

main()
  .catch((error) => {
    failures.push("script crashed");
    console.error(error);
  })
  .finally(async () => {
    try {
      await cleanup();
      console.log("cleaned up test rows");
    } catch (error) {
      console.error("CLEANUP FAILED — delete users ending in", DOMAIN, error);
    }
    await prisma.$disconnect();
    console.log(
      `\n${passed} passed, ${failures.length} failed${failures.length ? ": " + failures.join("; ") : ""}`,
    );
    process.exit(failures.length ? 1 : 0);
  });
