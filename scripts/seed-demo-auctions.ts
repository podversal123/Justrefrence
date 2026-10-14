/**
 * Demo auctions for the "Auctions" pages: three live forward auctions on real
 * approved listings of the demo vendors, with a few bids from demo members.
 * Uses the real auction service, so the data obeys every rule.
 *
 *   npx tsx --conditions=react-server --env-file=.env --env-file=.env.local scripts/seed-demo-auctions.ts
 *   npx tsx --conditions=react-server --env-file=.env --env-file=.env.local scripts/seed-demo-auctions.ts --remove
 *
 * Needs seed-demo-catalog.ts and create-demo-logins.ts to have run first.
 * Closing times are relative to "now", so re-run it before a demo to refresh them.
 * Re-running removes and recreates only the demo vendors' auctions that nobody has paid for yet.
 */
import { prisma } from "@/server/lib/prisma";
import { createAuction, placeAuctionBid } from "@/server/domain/auction/auction-service";

const DEMO_VENDOR_FILTER = {
  OR: [
    { user: { email: "vendor.demo@example.com" } },
    { user: { email: { endsWith: "@demo.justreference.test" } } },
  ],
};
const days = (n: number) => new Date(Date.now() + n * 86_400_000);
const rupees = (n: number) => BigInt(n) * 100n;

/** Which listing (by position among the demo vendors' products) and how the auction is set up. */
const PLANS = [
  {
    quantity: 2,
    startRupees: 3000,
    raiseRupees: 100,
    reserveRupees: 3500,
    closesInDays: 2,
    bids: [3000, 3200, 3600],
  },
  {
    quantity: 1,
    startRupees: 1000,
    raiseRupees: 50,
    reserveRupees: null,
    closesInDays: 3,
    bids: [1000, 1100],
  },
  {
    quantity: 5,
    startRupees: 500,
    raiseRupees: 25,
    reserveRupees: 800,
    closesInDays: 5,
    bids: [] as number[],
  },
];

async function remove() {
  const vendors = await prisma.vendorProfile.findMany({
    where: DEMO_VENDOR_FILTER,
    select: { id: true },
  });
  const auctions = await prisma.auction.findMany({
    where: { vendorId: { in: vendors.map((v) => v.id) }, checkoutId: null },
    select: { id: true },
  });
  const ids = auctions.map((a) => a.id);
  await prisma.auction.updateMany({ where: { id: { in: ids } }, data: { winningBidId: null } });
  await prisma.auctionBid.deleteMany({ where: { auctionId: { in: ids } } });
  await prisma.auction.deleteMany({ where: { id: { in: ids } } });
  console.log(`removed ${ids.length} demo auction(s)`);
}

async function main() {
  await remove(); // re-running refreshes closing times instead of duplicating
  if (process.argv.includes("--remove")) return;

  const products = await prisma.product.findMany({
    where: {
      vendor: { ...DEMO_VENDOR_FILTER, approvalStatus: "APPROVED" },
      approvalStatus: "APPROVED",
      isActive: true,
      deletedAt: null,
      stock: { gte: 5 },
    },
    orderBy: { createdAt: "asc" },
    take: PLANS.length,
    select: { id: true, vendorId: true, title: true },
  });
  if (products.length === 0)
    throw new Error("No approved demo products found. Run seed-demo-catalog.ts first.");

  const bidders = await prisma.user.findMany({
    where: {
      status: "ACTIVE",
      memberProfile: { isNot: null },
      OR: [
        { email: "customer.demo@example.com" },
        { email: { endsWith: "@demo.justreference.test" } },
      ],
    },
    orderBy: { email: "asc" },
    select: { id: true, email: true, vendorProfile: { select: { id: true } } },
  });

  for (const [index, product] of products.entries()) {
    const plan = PLANS[index]!;
    const created = await createAuction({
      vendorProfileId: product.vendorId,
      itemType: "PRODUCT",
      itemId: product.id,
      description: "Sealed and ready to ship. The winner pays at the winning price.",
      quantity: plan.quantity,
      startPrice: rupees(plan.startRupees),
      reservePrice: plan.reserveRupees === null ? null : rupees(plan.reserveRupees),
      minIncrement: rupees(plan.raiseRupees),
      autoExtendMinutes: 5,
      closesAt: days(plan.closesInDays),
    });

    // Bidders take turns; the seller of this auction never bids on it.
    const eligible = bidders.filter((b) => b.vendorProfile?.id !== product.vendorId);
    for (const [bidIndex, price] of plan.bids.entries()) {
      const bidder = eligible[bidIndex % eligible.length];
      if (!bidder) break;
      await placeAuctionBid({
        auctionId: created.id,
        bidderId: bidder.id,
        unitPrice: rupees(price),
      });
    }
    console.log(
      `created AUC-${created.auctionSeq.toString().padStart(6, "0")}: ${product.title} (${plan.bids.length} bids)`,
    );
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
