/**
 * Small demo extras that the other demo scripts do not create, so the Subscription, Coupons and Rewards
 * pages have something to show: four listings for the demo vendor account, a yearly subscription plan, a WELCOME10 coupon, three rewards for the
 * demo member (cash, a coupon and a gift) and one unused e-pin. Money and codes go through the app's own
 * services (the cash reward is a real wallet ledger credit, the e-pin is hashed), nothing is written by
 * hand. Safe to re-run: each piece is skipped if it already exists.
 *
 *   npx tsx --conditions=react-server --env-file=.env --env-file=.env.local scripts/seed-demo-extras.ts
 *
 * Needs create-demo-logins.ts to have run (the demo member) and a Super Admin to exist.
 * Like the other demo scripts it is for demos only: the cash reward is a permanent ledger row.
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/server/lib/prisma";
import { grantReward } from "@/server/domain/rewards/reward-service";
import { generateEpin } from "@/server/domain/epin/epin-service";
import type { GrantRewardInput } from "@/lib/schemas/reward";

const MEMBER_EMAIL = "customer.demo@example.com";
const rupees = (n: number) => BigInt(n) * 100n;
const days = (n: number) => new Date(Date.now() + n * 86_400_000);

async function main() {
  const admin = await prisma.user.findFirst({
    where: { userRoles: { some: { revokedAt: null, role: { code: "SUPER_ADMIN" } } } },
    select: { id: true },
  });
  if (!admin) throw new Error("No Super Admin found. Run bootstrap-admin.ts first.");
  const member = await prisma.user.findUnique({
    where: { email: MEMBER_EMAIL },
    select: { id: true, memberProfile: { select: { id: true } } },
  });
  if (!member?.memberProfile)
    throw new Error("The demo member does not exist. Run create-demo-logins.ts first.");

  // 0. a few listings of the demo vendor account itself, so the Vendor panel has something to show
  const vendor = await prisma.vendorProfile.findFirst({
    where: { user: { email: "vendor.demo@example.com" } },
    select: { id: true },
  });
  if (vendor) {
    const [pc, sc, jc] = await Promise.all([
      prisma.productCategory.findFirst({
        where: { deletedAt: null },
        orderBy: { name: "asc" },
        select: { id: true },
      }),
      prisma.serviceCategory.findFirst({
        where: { deletedAt: null },
        orderBy: { name: "asc" },
        select: { id: true },
      }),
      prisma.projectCategory.findFirst({
        where: { deletedAt: null },
        orderBy: { name: "asc" },
        select: { id: true },
      }),
    ]);
    const approved = {
      approvalStatus: "APPROVED" as const,
      isActive: true,
      approvedBy: admin.id,
      approvedAt: new Date(),
    };
    if (pc) {
      for (const [slug, title, description, price, stock] of [
        [
          "demo-vendor-wireless-keyboard-mouse-combo",
          "Wireless Keyboard and Mouse Combo",
          "2.4 GHz wireless keyboard and optical mouse with one USB receiver. Quiet keys, 12-month warranty.",
          149900n,
          40,
        ],
        [
          "demo-vendor-a4-printer-paper-box-5-reams",
          "A4 Printer Paper, Box of 5 Reams",
          "75 GSM bright white A4 paper, 500 sheets per ream. Suitable for laser and inkjet printers.",
          189000n,
          100,
        ],
      ] as const) {
        await prisma.product.upsert({
          where: { slug },
          update: {},
          create: {
            vendorId: vendor.id,
            categoryId: pc.id,
            slug,
            title,
            description,
            sku: slug.slice(-12).toUpperCase(),
            price,
            stock,
            ...approved,
          },
        });
      }
    }
    if (sc) {
      await prisma.service.upsert({
        where: { slug: "demo-vendor-annual-pc-maintenance-contract" },
        update: {},
        create: {
          vendorId: vendor.id,
          categoryId: sc.id,
          slug: "demo-vendor-annual-pc-maintenance-contract",
          title: "Annual PC Maintenance Contract (up to 20 systems)",
          description:
            "Four scheduled visits a year, cleaning, software updates and priority support for up to 20 desktops.",
          pricingType: "FIXED",
          price: 3600000n,
          ...approved,
        },
      });
    }
    if (jc) {
      await prisma.project.upsert({
        where: { slug: "demo-vendor-small-office-network-setup" },
        update: {},
        create: {
          vendorId: vendor.id,
          categoryId: jc.id,
          slug: "demo-vendor-small-office-network-setup",
          title: "Small Office Network Setup (up to 25 users)",
          description:
            "Structured cabling, router and switch configuration, Wi-Fi coverage survey and a written network diagram.",
          price: 7500000n,
          ...approved,
        },
      });
    }
    console.log("Listings of vendor.demo ready (2 products, 1 service, 1 project).");
  }

  // 1. a yearly subscription plan
  const plan = await prisma.subscriptionPlan.upsert({
    where: { code: "YEARLY-PRO" },
    update: {},
    create: {
      code: "YEARLY-PRO",
      type: "YEARLY",
      price: rupees(999),
      currency: "INR",
      durationDays: 365,
      active: true,
      createdBy: admin.id,
    },
  });
  console.log(`Plan ${plan.code} ready (₹999, 365 days).`);

  // 2. a general welcome coupon
  const coupon = await prisma.coupon.upsert({
    where: { code: "WELCOME10" },
    update: {},
    create: {
      code: "WELCOME10",
      discountType: "PERCENT",
      valuePercentBps: 1000,
      minOrderAmount: rupees(500),
      startsAt: new Date("2026-10-05T00:00:00Z"),
      expiresAt: null,
      usageLimit: null,
      usageLimitPerMember: 1,
      createdBy: admin.id,
    },
  });
  console.log(`Coupon ${coupon.code} ready (10% off orders of ₹500 or more).`);

  // 3. rewards for the demo member, through the real reward service
  const have = new Set(
    (
      await prisma.reward.findMany({
        where: { memberId: member.memberProfile.id },
        select: { title: true },
      })
    ).map((r) => r.title),
  );
  const rewards: GrantRewardInput[] = [
    {
      userId: member.id,
      title: "Diwali bonus",
      reason: "Top referrer of the month",
      idempotencyKey: randomUUID(),
      type: "CASH",
      amount: rupees(250),
    },
    {
      userId: member.id,
      title: "Welcome 10% off",
      reason: "Thanks for your first order",
      idempotencyKey: randomUUID(),
      type: "COUPON",
      discountType: "PERCENT",
      valuePercentBps: 1000,
      valueFixed: null,
      minOrderAmount: 0n,
      expiresAt: days(30),
    },
    {
      userId: member.id,
      title: "Branded jacket",
      reason: "Goodwill gift from the team",
      idempotencyKey: randomUUID(),
      type: "OTHER",
      expiresAt: null,
    },
  ];
  for (const reward of rewards) {
    if (have.has(reward.title)) {
      console.log(`Reward "${reward.title}" already exists, skipped.`);
      continue;
    }
    await grantReward(admin.id, reward);
    console.log(`Reward "${reward.title}" paid to ${MEMBER_EMAIL}.`);
  }

  // 4. one unused e-pin (its code is shown only now, it is stored hashed)
  const existing = await prisma.epin.count({ where: { planId: plan.id, status: "FRESH" } });
  if (existing === 0) {
    const epin = await generateEpin({
      planId: plan.id,
      generatedBy: admin.id,
      expiresAt: days(90),
    });
    console.log(`E-pin generated (shown once): ${epin.rawCode}`);
  } else {
    console.log("An unused e-pin already exists, skipped (its code was shown when it was made).");
  }
  await prisma.$disconnect();
}

void main();
