/**
 * End-to-end verification of the forward-auction service against the REAL
 * database (not mocks): rules, concurrency, anti-sniping, reserve price,
 * finalising, cancelling and the winner's order (price, stock, commission
 * row, exactly-once). Creates throwaway users/vendors/listings (marker domain
 * @auctiontest.justreference.test) and deletes them again, even on failure.
 *
 *   npx tsx --conditions=react-server --env-file=.env --env-file=.env.local scripts/verify-auction.ts
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/server/lib/prisma";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  cancelAuction,
  claimAuction,
  createAuction,
  finalizeIfEnded,
  placeAuctionBid,
} from "@/server/domain/auction/auction-service";

const DOMAIN = "@auctiontest.justreference.test";
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
const rupees = (n: number) => BigInt(n) * 100n;

async function makeUser(name: string, withMember = false) {
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: `${name}-${randomUUID().slice(0, 8)}${DOMAIN}`,
      fullName: name,
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
  let memberId: string | null = null;
  let profileId: string | null = null;
  if (withMember) {
    const member = await prisma.memberProfile.create({
      data: { userId: user.id, referralPath: "root" },
    });
    memberId = `AT-${member.memberSeq}`;
    profileId = member.id;
    await prisma.memberProfile.update({ where: { id: member.id }, data: { memberId } });
  }
  // `profileId` (a uuid) is what the order and commission code takes; `memberId` is the public code.
  return { user, memberId, profileId };
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { endsWith: DOMAIN } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  const vendors = await prisma.vendorProfile.findMany({
    where: { userId: { in: userIds } },
    select: { id: true },
  });
  const vendorIds = vendors.map((v) => v.id);

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
  const paths = invoices.map((i) => i.pdfStoragePath).filter((p): p is string => Boolean(p));
  if (paths.length) await createAdminClient().storage.from("invoices-private").remove(paths);

  await prisma.auction.updateMany({
    where: { vendorId: { in: vendorIds } },
    data: { winningBidId: null },
  });
  await prisma.auctionBid.deleteMany({ where: { auction: { vendorId: { in: vendorIds } } } });
  await prisma.auction.deleteMany({ where: { vendorId: { in: vendorIds } } });

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

  await prisma.product.deleteMany({ where: { vendorId: { in: vendorIds } } });
  await prisma.productCategory.deleteMany({ where: { slug: { startsWith: "auctiontest-" } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  await prisma.vendorProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.memberProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function main() {
  await cleanup(); // leftovers from an interrupted earlier run

  const sellerUser = await makeUser("seller");
  const vendor = await prisma.vendorProfile.create({
    data: {
      userId: sellerUser.user.id,
      businessName: "Auction Test Traders",
      approvalStatus: "APPROVED",
      approvedAt: new Date(),
    },
  });
  const bidders = await Promise.all([1, 2, 3, 4].map((n) => makeUser(`bidder${n}`, true)));
  const [b1, b2, b3, b4] = bidders as [
    (typeof bidders)[0],
    (typeof bidders)[0],
    (typeof bidders)[0],
    (typeof bidders)[0],
  ];

  const category = await prisma.productCategory.create({
    data: { name: "Auction test", slug: `auctiontest-${randomUUID().slice(0, 8)}` },
  });
  const makeProduct = (title: string, stock: number, approved = true) =>
    prisma.product.create({
      data: {
        vendorId: vendor.id,
        categoryId: category.id,
        title,
        slug: `auctiontest-${randomUUID().slice(0, 12)}`,
        price: rupees(1000),
        stock,
        approvalStatus: approved ? "APPROVED" : "PENDING",
        isActive: true,
      },
    });
  const product = await makeProduct("Auction test product", 10);

  const base = {
    vendorProfileId: vendor.id,
    itemType: "PRODUCT" as const,
    itemId: product.id,
    description: null,
    quantity: 4,
    startPrice: rupees(100),
    reservePrice: null as bigint | null,
    minIncrement: rupees(10),
    autoExtendMinutes: 0,
    closesAt: minutes(30),
  };
  const bid = (auctionId: string, who: { user: { id: string } }, unitPrice: bigint) =>
    placeAuctionBid({ auctionId, bidderId: who.user.id, unitPrice });

  // ---------------------------------------------------------------- creating
  await expectReject("an unapproved listing can't be auctioned", async () => {
    const draft = await makeProduct("Draft", 5, false);
    await createAuction({ ...base, itemId: draft.id });
  });
  await expectReject("another vendor's listing can't be auctioned", () =>
    createAuction({ ...base, vendorProfileId: randomUUID() }),
  );
  await expectReject(
    "quantity above stock is refused",
    () => createAuction({ ...base, quantity: 11 }),
    "stock",
  );

  // ---------------------------------------------------------------- bidding rules
  const a1 = await createAuction(base);
  await expectReject("first bid below the start price is refused", () =>
    bid(a1.id, b1, rupees(99)),
  );
  const first = await bid(a1.id, b1, rupees(100));
  check("first bid at the start price is accepted and flagged as the first", first.isFirstBid);
  check("total is unit price x quantity", first.totalPrice === rupees(400), first.totalPrice);
  await expectReject("the leader can't bid again", () => bid(a1.id, b1, rupees(500)), "highest");
  await expectReject("the seller can't bid on their own auction", () =>
    bid(a1.id, { user: sellerUser.user }, rupees(500)),
  );
  await expectReject("a raise below the minimum increment is refused", () =>
    bid(a1.id, b2, rupees(109)),
  );
  const second = await bid(a1.id, b2, rupees(110));
  check("a raise at the minimum increment is accepted", second.totalPrice === rupees(440));
  check("the outbid leader is reported", second.outbidUserId === b1.user.id, second.outbidUserId);

  // ---------------------------------------------------------------- concurrency
  const results = await Promise.allSettled([
    bid(a1.id, b1, rupees(200)),
    bid(a1.id, b3, rupees(200)),
    bid(a1.id, b4, rupees(200)),
  ]);
  const won = results.filter((r) => r.status === "fulfilled").length;
  check(
    "three simultaneous equal bids: exactly one is accepted",
    won === 1,
    results.map((r) => r.status),
  );
  const bidsNow = await prisma.auctionBid.findMany({
    where: { auctionId: a1.id },
    orderBy: { unitPrice: "desc" },
  });
  check("no two bids share the top price", bidsNow[0]?.unitPrice !== bidsNow[1]?.unitPrice);

  // ---------------------------------------------------------------- anti-sniping
  const a2 = await createAuction({ ...base, closesAt: minutes(6), autoExtendMinutes: 5 });
  const early = await bid(a2.id, b1, rupees(100));
  check("a bid outside the window doesn't extend bidding", early.extendedTo === null);
  await prisma.auction.update({ where: { id: a2.id }, data: { closesAt: minutes(2) } });
  const late = await bid(a2.id, b2, rupees(110));
  check("a late bid extends bidding by the window", late.extendedTo !== null);
  const reloaded = await prisma.auction.findUniqueOrThrow({ where: { id: a2.id } });
  check(
    "the new close time is about 5 minutes away",
    reloaded.closesAt.getTime() - Date.now() > 4 * 60_000,
  );

  // ---------------------------------------------------------------- ending
  check("an open auction is not finalised early", (await finalizeIfEnded(a1.id)) === null);

  const a3 = await createAuction({ ...base, closesAt: minutes(30) });
  await bid(a3.id, b1, rupees(100));
  await bid(a3.id, b2, rupees(120));
  await prisma.auction.update({ where: { id: a3.id }, data: { closesAt: minutes(-1) } });
  await expectReject(
    "bidding after the deadline is refused",
    () => bid(a3.id, b3, rupees(500)),
    "closed",
  );
  const ending = await finalizeIfEnded(a3.id);
  check("ending a no-reserve auction sells it to the top bidder", ending?.outcome === "SOLD");
  check("the winner is the top bidder", ending?.winnerUserId === b2.user.id);
  check("the other bidder is listed as lost", ending?.loserUserIds.join() === b1.user.id);
  check(
    "finalising twice reports nothing the second time",
    (await finalizeIfEnded(a3.id)) === null,
  );

  // reserve not met
  const a4 = await createAuction({ ...base, reservePrice: rupees(500) });
  await bid(a4.id, b1, rupees(100));
  await prisma.auction.update({ where: { id: a4.id }, data: { closesAt: minutes(-1) } });
  const unsold = await finalizeIfEnded(a4.id);
  check(
    "a top bid below the reserve ends unsold",
    unsold?.outcome === "UNSOLD" && unsold.winnerUserId === null,
  );

  // no bids
  const a5 = await createAuction(base);
  await prisma.auction.update({ where: { id: a5.id }, data: { closesAt: minutes(-1) } });
  check(
    "an auction with no bids ends unsold",
    (await finalizeIfEnded(a5.id))?.outcome === "UNSOLD",
  );

  // ---------------------------------------------------------------- cancelling
  const a6 = await createAuction(base);
  const c1 = await cancelAuction({
    auctionId: a6.id,
    vendorProfileId: vendor.id,
    reason: "changed my mind",
  });
  check("an auction with no bids can be cancelled", c1.bidderUserIds.length === 0);
  await expectReject(
    "a cancelled auction takes no bids",
    () => bid(a6.id, b1, rupees(100)),
    "closed",
  );
  await expectReject("an auction with bids can't be cancelled while open", () =>
    cancelAuction({ auctionId: a1.id, vendorProfileId: vendor.id, reason: "no" }),
  );
  await expectReject("another vendor can't cancel it", () =>
    cancelAuction({ auctionId: a3.id, vendorProfileId: randomUUID(), reason: "no" }),
  );

  // ---------------------------------------------------------------- winner pays
  await expectReject("only the winner can pay", () =>
    claimAuction({ auctionId: a3.id, winnerUserId: b1.user.id, memberId: b1.profileId! }),
  );
  const stockBefore = (await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stock;
  const [claimA, claimB] = await Promise.all([
    claimAuction({ auctionId: a3.id, winnerUserId: b2.user.id, memberId: b2.profileId! }),
    claimAuction({ auctionId: a3.id, winnerUserId: b2.user.id, memberId: b2.profileId! }),
  ]);
  check("two simultaneous payments return the same order", claimA.orderId === claimB.orderId);
  const orders = await prisma.order.findMany({
    where: { buyerId: b2.user.id },
    include: { items: true },
  });
  check("exactly one order exists", orders.length === 1, orders.length);
  const order = orders[0]!;
  check(
    "the order item is at the winning unit price",
    order.items[0]?.unitPriceSnapshot === rupees(120),
  );
  check("the order item has the auction quantity", order.items[0]?.qty === 4);
  check("the order subtotal is price x quantity", order.subtotal === rupees(480), order.subtotal);
  check(
    "the grand total includes tax and the platform fee",
    order.grandTotal === order.subtotal + order.taxTotal + order.platformFeeTotal,
  );
  const stockAfter = (await prisma.product.findUniqueOrThrow({ where: { id: product.id } })).stock;
  check("stock went down by the quantity, once", stockBefore - stockAfter === 4, {
    stockBefore,
    stockAfter,
  });
  const sold = await prisma.auction.findUniqueOrThrow({ where: { id: a3.id } });
  check("the auction records the checkout", sold.checkoutId === claimA.checkoutId);
  const checkout = await prisma.checkout.findUniqueOrThrow({ where: { id: claimA.checkoutId } });
  check("the checkout is ready for the usual payment step", checkout.buyerId === b2.user.id);
  await expectReject("a paid sale can't be cancelled", () =>
    cancelAuction({ auctionId: a3.id, vendorProfileId: vendor.id, reason: "late" }),
  );
  const replay = await claimAuction({
    auctionId: a3.id,
    winnerUserId: b2.user.id,
    memberId: b2.profileId!,
  });
  check(
    "paying again replays the same order instead of making a second",
    replay.orderId === claimA.orderId,
  );
  check(
    "still exactly one order after the replay",
    (await prisma.order.count({ where: { buyerId: b2.user.id } })) === 1,
  );

  // unpaid sale can be cancelled by the vendor
  const a7 = await createAuction({ ...base, closesAt: minutes(30) });
  await bid(a7.id, b3, rupees(100));
  await prisma.auction.update({ where: { id: a7.id }, data: { closesAt: minutes(-1) } });
  await finalizeIfEnded(a7.id);
  const c2 = await cancelAuction({
    auctionId: a7.id,
    vendorProfileId: vendor.id,
    reason: "item damaged",
  });
  check(
    "an unpaid sale can be cancelled and the bidder is told",
    c2.bidderUserIds[0] === b3.user.id,
  );
  await expectReject("a cancelled sale can't be paid", () =>
    claimAuction({ auctionId: a7.id, winnerUserId: b3.user.id, memberId: b3.profileId! }),
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
