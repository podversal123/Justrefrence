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
import { createAdminClient } from "@/lib/supabase/admin";
import {
  awardBid,
  cancelRequirement,
  claimAwardedBid,
  createRequirement,
  placeBid,
  withdrawBid,
} from "@/server/domain/bidding/bidding-service";
import { initiateRefund, payCheckoutWithWallet } from "@/server/domain/payment/payment-service";
import { creditWallet, getOrCreateWallet } from "@/server/repositories/wallet/wallet-repository";

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
async function makeMember(userId: string) {
  const member = await prisma.memberProfile.create({ data: { userId, referralPath: "root" } });
  await prisma.memberProfile.update({
    where: { id: member.id },
    data: { memberId: `BT-${member.memberSeq}` },
  });
  return member.id; // the profile id (a uuid), which is what the order code takes as memberId
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
  const pays = await prisma.payment.findMany({ where: { payerId: { in: userIds } }, select: { id: true } });
  await prisma.paymentTransaction.deleteMany({ where: { paymentId: { in: pays.map((x) => x.id) } } });
  await prisma.paymentEvent.deleteMany({ where: { paymentId: { in: pays.map((x) => x.id) } } });
  await prisma.payment.deleteMany({ where: { id: { in: pays.map((x) => x.id) } } });
  const wallets = await prisma.wallet.findMany({ where: { ownerUserId: { in: userIds } }, select: { id: true } });
  await prisma.walletTransaction.deleteMany({ where: { walletId: { in: wallets.map((x) => x.id) } } });
  await prisma.wallet.deleteMany({ where: { id: { in: wallets.map((x) => x.id) } } });
  const reqs = await prisma.requirement.findMany({
    where: { buyerId: { in: userIds } },
    select: { id: true },
  });
  const reqIds = reqs.map((r) => r.id);

  const vendorIds = (
    await prisma.vendorProfile.findMany({
      where: { userId: { in: userIds } },
      select: { id: true },
    })
  ).map((v) => v.id);
  const orders = await prisma.order.findMany({
    where: { OR: [{ buyerId: { in: userIds } }, { vendorId: { in: vendorIds } }] },
    select: { id: true, checkoutId: true },
  });
  const orderIds = orders.map((o) => o.id);
  const checkoutIds = [...new Set(orders.map((o) => o.checkoutId))];
  const invoices = await prisma.invoice.findMany({
    where: { orderId: { in: orderIds } },
    select: { pdfStoragePath: true },
  });
  const paths = invoices.map((i) => i.pdfStoragePath).filter((x): x is string => Boolean(x));
  if (paths.length) await createAdminClient().storage.from("invoices-private").remove(paths);
  await prisma.commissionStatusHistory.deleteMany({
    where: { commission: { orderId: { in: orderIds } } },
  });
  await prisma.commission.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.invoiceItem.deleteMany({ where: { invoice: { orderId: { in: orderIds } } } });
  await prisma.invoice.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  const checkouts = await prisma.checkout.findMany({
    where: { id: { in: checkoutIds } },
    select: { cartId: true },
  });
  await prisma.checkout.deleteMany({ where: { id: { in: checkoutIds } } });
  await prisma.cart.deleteMany({
    where: {
      OR: [{ id: { in: checkouts.map((c) => c.cartId) } }, { ownerUserId: { in: userIds } }],
    },
  });

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
  await prisma.referralRelationship.deleteMany({
    where: {
      OR: [{ member: { userId: { in: userIds } } }, { referrer: { userId: { in: userIds } } }],
    },
  });
  await prisma.memberProfile.deleteMany({ where: { userId: { in: userIds } } });
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
  const buyerMemberId = await makeMember(buyer.id);
  // The buyer was referred by someone, so a commission can be made when the order is placed.
  const referrer = await makeUser("referrer");
  const referrerMemberId = await makeMember(referrer.id);
  await prisma.referralRelationship.create({
    data: { memberId: buyerMemberId, referrerId: referrerMemberId, level: 1 },
  });
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

  // ---------------------------------------------------------------- the buyer pays for the award
  await expectReject(
    "only the buyer who posted the requirement can pay for the award",
    () =>
      claimAwardedBid({ requirementId: ra.id, buyerUserId: v2.user.id, memberId: buyerMemberId }),
    "not found",
  );
  const [claimA, claimB] = await Promise.all([
    claimAwardedBid({ requirementId: ra.id, buyerUserId: buyer.id, memberId: buyerMemberId }),
    claimAwardedBid({ requirementId: ra.id, buyerUserId: buyer.id, memberId: buyerMemberId }),
  ]);
  check("two simultaneous payments return the same order", claimA.orderId === claimB.orderId);
  const bidOrders = await prisma.order.findMany({
    where: { buyerId: buyer.id },
    include: { items: true },
  });
  check("exactly one order exists", bidOrders.length === 1, bidOrders.length);
  const bidOrder = bidOrders[0]!;
  const winningBid = await prisma.bid.findUniqueOrThrow({ where: { id: sniped.bidId } });
  const reqRow = await prisma.requirement.findUniqueOrThrow({ where: { id: ra.id } });
  check("the order belongs to the winning vendor", bidOrder.vendorId === v1.profileId);
  check(
    "the order line is at the winning unit price and the requested quantity",
    bidOrder.items.length === 1 &&
      bidOrder.items[0]!.unitPriceSnapshot === winningBid.unitPrice &&
      bidOrder.items[0]!.qty === reqRow.quantity &&
      bidOrder.items[0]!.lineTotal === winningBid.unitPrice * BigInt(reqRow.quantity),
    bidOrder.items[0],
  );
  check(
    "the order starts as PLACED and its total is at least the line total",
    bidOrder.status === "PLACED" && bidOrder.grandTotal >= bidOrder.subtotal,
    bidOrder.status,
  );
  const level1Rules = await prisma.commissionRule.count({ where: { level: 1 } });
  if (level1Rules > 0) {
    check(
      "the referrer earns a commission on the paid order (the member profile id works end to end)",
      (await prisma.commission.count({ where: { orderId: bidOrder.id } })) >= 1,
    );
  } else {
    console.log("SKIP  commission check: no level-1 commission rule exists in this database");
  }
  check(
    "the requirement remembers the checkout, so it cannot be paid twice",
    reqRow.checkoutId === claimA.checkoutId,
  );
  const replayClaim = await claimAwardedBid({
    requirementId: ra.id,
    buyerUserId: buyer.id,
    memberId: buyerMemberId,
  });
  check("paying again replays the same order", replayClaim.orderId === claimA.orderId);
  check(
    "still exactly one order after the replay",
    (await prisma.order.count({ where: { buyerId: buyer.id } })) === 1,
  );

  // ---------------------------------------------------------------- paying that order from the wallet
  const payKey = randomUUID();
  const orderTotal = bidOrder.grandTotal;
  await expectReject(
    "an empty wallet cannot pay (nothing is written)",
    () => payCheckoutWithWallet({ checkoutId: claimA.checkoutId, payerId: buyer.id, idempotencyKey: payKey }),
    "not enough",
  );
  check(
    "the refused payment left no payment row and the order stays PLACED",
    (await prisma.payment.count({ where: { checkoutId: claimA.checkoutId } })) === 0 &&
      (await prisma.order.findUniqueOrThrow({ where: { id: bidOrder.id } })).status === "PLACED",
  );
  const buyerWallet = await getOrCreateWallet(buyer.id);
  await prisma.$transaction((tx) =>
    creditWallet(tx, {
      walletId: buyerWallet.id,
      amount: orderTotal + 500n,
      type: "TOPUP",
      referenceType: "TEST",
      referenceId: buyer.id,
      idempotencyKey: `verify-fund:${buyer.id}`,
    }),
  );
  await expectReject(
    "another member cannot pay my checkout from their wallet",
    () => payCheckoutWithWallet({ checkoutId: claimA.checkoutId, payerId: v2.user.id, idempotencyKey: randomUUID() }),
    "not found",
  );
  const walletPay = await payCheckoutWithWallet({ checkoutId: claimA.checkoutId, payerId: buyer.id, idempotencyKey: payKey });
  check("the wallet payment is accepted for the full order total", walletPay.amount === orderTotal && !walletPay.replay);
  check(
    "the order is now PAID",
    (await prisma.order.findUniqueOrThrow({ where: { id: bidOrder.id } })).status === "PAID",
  );
  check(
    "the wallet was debited exactly the order total (500 paise left)",
    (await prisma.wallet.findUniqueOrThrow({ where: { id: buyerWallet.id } })).balance === 500n,
  );
  const payRow = await prisma.payment.findUniqueOrThrow({ where: { id: walletPay.paymentId } });
  check("the payment is CAPTURED and recorded as a wallet payment", payRow.status === "CAPTURED" && payRow.provider === "WALLET");
  const replayPay = await payCheckoutWithWallet({ checkoutId: claimA.checkoutId, payerId: buyer.id, idempotencyKey: payKey });
  check("the same request id returns the same payment and charges nothing more", replayPay.paymentId === walletPay.paymentId && replayPay.replay);
  await expectReject(
    "a paid checkout cannot be paid again with a new request id",
    () => payCheckoutWithWallet({ checkoutId: claimA.checkoutId, payerId: buyer.id, idempotencyKey: randomUUID() }),
    "already been paid",
  );
  check(
    "the balance is still 500 paise after the attempts",
    (await prisma.wallet.findUniqueOrThrow({ where: { id: buyerWallet.id } })).balance === 500n,
  );
  await initiateRefund(walletPay.paymentId, buyer.id);
  check(
    "refunding a wallet payment puts the money back in the wallet",
    (await prisma.wallet.findUniqueOrThrow({ where: { id: buyerWallet.id } })).balance === orderTotal + 500n,
  );
  check(
    "the order is REFUNDED and the payment is REFUNDED",
    (await prisma.order.findUniqueOrThrow({ where: { id: bidOrder.id } })).status === "REFUNDED" &&
      (await prisma.payment.findUniqueOrThrow({ where: { id: walletPay.paymentId } })).status === "REFUNDED",
  );
  const ledger = await prisma.walletTransaction.findMany({ where: { walletId: buyerWallet.id } });
  const net = ledger.reduce((sum, t) => sum + (t.direction === "CREDIT" ? t.amount : -t.amount), 0n);
  check(
    "the ledger adds up to the balance (top-up, order payment, refund)",
    ledger.length === 3 && net === orderTotal + 500n,
    ledger.map((t) => `${t.type}:${t.direction}`),
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
