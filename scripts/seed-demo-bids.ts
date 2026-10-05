/**
 * Demo bids for the "Bids and auctions" pages: a few open requirements posted
 * by the demo customer, with offers from the demo vendors (including the
 * sign-in-able vendor.demo account). Uses the real bidding service so the
 * data obeys every rule.
 *
 *   npx tsx --conditions=react-server --env-file=.env --env-file=.env.local scripts/seed-demo-bids.ts
 *   npx tsx --conditions=react-server --env-file=.env --env-file=.env.local scripts/seed-demo-bids.ts --remove
 *
 * Needs seed-demo-catalog.ts and create-demo-logins.ts to have run first
 * (demo vendors + the demo customer must exist). Closing times are relative
 * to "now", so re-run it before a demo to refresh them.
 */
import { prisma } from "@/server/lib/prisma";
import { createRequirement, placeBid } from "@/server/domain/bidding/bidding-service";

const CUSTOMER_EMAIL = "customer.demo@example.com";
const days = (n: number) => new Date(Date.now() + n * 86_400_000);
const rupees = (n: number) => BigInt(n) * 100n;

interface DemoRequirement {
  title: string;
  description: string;
  itemKind: "PRODUCT" | "SERVICE" | "PROJECT";
  categoryLabel: string;
  quantity: number;
  unit: string;
  deliveryCity: string;
  maxBudgetRupees: number | null;
  type: "TENDER" | "REVERSE_AUCTION";
  closesInDays: number;
  minDecrementRupees?: number;
  autoExtendMinutes?: number;
  /** [vendor email, unit price in rupees, delivery days], placed in this order. */
  bids: [string, number, number][];
}

const REQUIREMENTS: DemoRequirement[] = [
  {
    title: "50 ergonomic mesh office chairs",
    description:
      "Adjustable lumbar support, breathable mesh back, height-adjustable arms, 5-year frame warranty.\nDelivery and assembly at our office in New Delhi. Please quote per chair, GST extra.",
    itemKind: "PRODUCT",
    categoryLabel: "Office Furniture",
    quantity: 50,
    unit: "chairs",
    deliveryCity: "New Delhi",
    maxBudgetRupees: 450000,
    type: "TENDER",
    closesInDays: 2,
    bids: [
      ["northwind@demo.justreference.test", 7999, 10],
      ["vendor.demo@example.com", 8250, 7],
      ["kaveri@demo.justreference.test", 8100, 14],
    ],
  },
  {
    title: "Annual IT support for a 40-seat office",
    description:
      "On-site and remote support for 40 desktops/laptops, network and printers. 12-month contract, 4-hour response time for critical issues.\nQuote per month; the total is for the full 12 months.",
    itemKind: "SERVICE",
    categoryLabel: "IT and Software Support",
    quantity: 12,
    unit: "months",
    deliveryCity: "Gurugram",
    maxBudgetRupees: 180000,
    type: "REVERSE_AUCTION",
    closesInDays: 2,
    minDecrementRupees: 100,
    autoExtendMinutes: 5,
    bids: [
      ["northwind@demo.justreference.test", 12500, 5],
      ["bluepeak@demo.justreference.test", 12000, 5],
      ["vendor.demo@example.com", 11800, 5],
      ["northwind@demo.justreference.test", 11600, 5],
    ],
  },
  {
    title: "Rooftop solar installation, 10 kW",
    description:
      "Design, supply, installation, net-metering paperwork and commissioning for a 10 kW on-grid system on an RCC roof.",
    itemKind: "PROJECT",
    categoryLabel: "Installation Projects",
    quantity: 1,
    unit: "project",
    deliveryCity: "Jaipur",
    maxBudgetRupees: null,
    type: "TENDER",
    closesInDays: 5,
    bids: [],
  },
];

async function vendorByEmail(email: string) {
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, vendorProfile: { select: { id: true } } },
  });
  if (!user?.vendorProfile)
    throw new Error(`No vendor profile for ${email}. Run the demo seed / login scripts first.`);
  return { userId: user.id, profileId: user.vendorProfile.id };
}

async function remove(customerId: string) {
  const reqs = await prisma.requirement.findMany({
    where: { buyerId: customerId, title: { in: REQUIREMENTS.map((r) => r.title) } },
    select: { id: true },
  });
  const ids = reqs.map((r) => r.id);
  await prisma.requirement.updateMany({ where: { id: { in: ids } }, data: { awardedBidId: null } });
  await prisma.bidRevision.deleteMany({ where: { bid: { requirementId: { in: ids } } } });
  await prisma.bid.deleteMany({ where: { requirementId: { in: ids } } });
  await prisma.requirement.deleteMany({ where: { id: { in: ids } } });
  console.log(`Removed ${ids.length} demo requirements.`);
}

async function main() {
  const customer = await prisma.user.findUnique({
    where: { email: CUSTOMER_EMAIL },
    select: { id: true },
  });
  if (!customer)
    throw new Error("Demo customer not found. Run scripts/create-demo-logins.ts first.");

  await remove(customer.id); // re-running refreshes closing times instead of duplicating
  if (process.argv.includes("--remove")) return;

  for (const demo of REQUIREMENTS) {
    const created = await createRequirement(customer.id, {
      title: demo.title,
      description: demo.description,
      itemKind: demo.itemKind,
      categoryLabel: demo.categoryLabel,
      quantity: demo.quantity,
      unit: demo.unit,
      deliveryCity: demo.deliveryCity,
      estimatedValue: demo.maxBudgetRupees === null ? null : rupees(demo.maxBudgetRupees),
      type: demo.type,
      closesAt: days(demo.closesInDays),
      minDecrement: rupees(demo.minDecrementRupees ?? 0),
      autoExtendMinutes: demo.autoExtendMinutes ?? 0,
    });
    for (const [email, unit, deliveryDays] of demo.bids) {
      const vendor = await vendorByEmail(email);
      await placeBid({
        requirementId: created.id,
        vendorProfileId: vendor.profileId,
        vendorUserId: vendor.userId,
        unitPrice: rupees(unit),
        deliveryDays,
        note: null,
      });
    }
    console.log(`Created "${demo.title}" (${demo.type}) with ${demo.bids.length} bids`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
