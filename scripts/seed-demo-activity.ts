/**
 * Sample platform activity for the demo, built one panel at a time.
 *
 *   npx tsx --conditions=react-server --env-file=.env --env-file=.env.local scripts/seed-demo-activity.ts --stage=super-admin
 *
 * Stage "super-admin" gives the Super Admin dashboard something to show:
 *   - sample commission rates (level 1 and 2) if none exist yet; editable in Admin > Commission rules
 *   - ten orders from the demo members, spread over the last 25 days and moved through the real
 *     order flow (cart, place order, admin marks paid, vendor steps, buyer confirms), so invoices,
 *     stock, audit entries and commissions all come from the app's own services
 *   - released commissions credited to the referrers' wallets through the wallet ledger
 *   - one pending seller request and two open support tickets
 *
 * Money rules: nothing here writes a balance or a ledger row by hand. The only direct SQL is moving
 * the date of rows this script just created back in time, so the charts show a real spread of days.
 * Re-running is safe: it stops if the demo orders already exist. There is deliberately no --remove,
 * because order and ledger rows are never deleted (see docs: reversals only).
 *
 * Stage "member" gives the demo member (customer.demo) a network and some history, so the Member panel
 * is worth looking at: two direct referrals and one indirect, their orders and the member's own, the
 * commissions the member earns from them (some already released to the wallet), and a support ticket.
 *
 * Needs seed-demo-catalog.ts to have run first (demo members, vendors and listings), and for the
 * member stage also create-demo-logins.ts (the demo member).
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/server/lib/prisma";
import { createRuleVersion } from "@/server/repositories/commission/commission-rule-repository";
import {
  getOrCreateOpenCart,
  upsertCartItemQty,
} from "@/server/repositories/commerce/cart-repository";
import { placeOrder } from "@/server/domain/commerce/checkout-service";
import { transitionOrderStatus } from "@/server/domain/commerce/order-service";
import { releaseEligibleCommissions } from "@/server/domain/commission/commission-service";
import { createNotification } from "@/server/repositories/identity/notification-repository";
import { createTicket } from "@/server/repositories/support/ticket-repository";
import { recordAudit } from "@/server/domain/audit/record";
import { buildReferralPath, formatMemberId } from "@/server/domain/identity/member-id";
import type { OrderStatus } from "@/server/domain/commerce/order-state-machine";

const DAY = 86_400_000;
const HOUR = 3_600_000;
const KEY_PREFIX = "demo-activity-order-";
const SUPER_ADMIN_EMAIL = "admin@justreference.in";

type Kind = "PRODUCT" | "SERVICE" | "PROJECT";

interface OrderSpec {
  n: number;
  buyer: string;
  /** [kind, title contains, quantity] */
  lines: [Kind, string, number][];
  daysAgo: number;
  finalStatus: OrderStatus;
}

const ORDERS: OrderSpec[] = [
  {
    n: 1,
    buyer: "priya",
    lines: [["PRODUCT", "Business Laptop", 1]],
    daysAgo: 24,
    finalStatus: "COMPLETED",
  },
  {
    n: 2,
    buyer: "priya",
    lines: [
      ["PRODUCT", "LED Panel", 3],
      ["PRODUCT", "Extension Board", 5],
    ],
    daysAgo: 18,
    finalStatus: "COMPLETED",
  },
  {
    n: 3,
    buyer: "neha",
    lines: [["PRODUCT", "Standing Desk", 1]],
    daysAgo: 15,
    finalStatus: "COMPLETED",
  },
  {
    n: 4,
    buyer: "priya",
    lines: [["PRODUCT", "Standing Desk", 1]],
    daysAgo: 12,
    finalStatus: "COMPLETED",
  },
  {
    n: 5,
    buyer: "neha",
    lines: [["PRODUCT", "QHD IPS Monitor", 2]],
    daysAgo: 11,
    finalStatus: "DELIVERED",
  },
  {
    n: 6,
    buyer: "imran",
    lines: [["PRODUCT", "Toner Cartridge", 4]],
    daysAgo: 9,
    finalStatus: "SHIPPED",
  },
  { n: 7, buyer: "priya", lines: [["SERVICE", "", 1]], daysAgo: 6, finalStatus: "PROCESSING" },
  {
    n: 8,
    buyer: "aarav",
    lines: [["PRODUCT", "QHD IPS Monitor", 1]],
    daysAgo: 4,
    finalStatus: "PAID",
  },
  {
    n: 9,
    buyer: "neha",
    lines: [["PRODUCT", "Extension Board", 10]],
    daysAgo: 2,
    finalStatus: "PLACED",
  },
  {
    n: 10,
    buyer: "imran",
    lines: [["PRODUCT", "LED Panel", 2]],
    daysAgo: 1,
    finalStatus: "CANCELLED",
  },
];

/** Orders for the member stage: the demo member and the people who joined through them. */
const MEMBER_ORDERS: OrderSpec[] = [
  {
    n: 1,
    buyer: "customer",
    lines: [["PRODUCT", "Extension Board", 6]],
    daysAgo: 21,
    finalStatus: "COMPLETED",
  },
  {
    n: 2,
    buyer: "kavya",
    lines: [["PRODUCT", "QHD IPS Monitor", 1]],
    daysAgo: 19,
    finalStatus: "COMPLETED",
  },
  {
    n: 3,
    buyer: "sameer",
    lines: [["PRODUCT", "LED Panel", 4]],
    daysAgo: 17,
    finalStatus: "COMPLETED",
  },
  {
    n: 4,
    buyer: "divya",
    lines: [["PRODUCT", "Toner Cartridge", 5]],
    daysAgo: 16,
    finalStatus: "COMPLETED",
  },
  {
    n: 5,
    buyer: "kavya",
    lines: [["PRODUCT", "Standing Desk", 1]],
    daysAgo: 12,
    finalStatus: "COMPLETED",
  },
  {
    n: 6,
    buyer: "customer",
    lines: [["PRODUCT", "LED Panel", 2]],
    daysAgo: 9,
    finalStatus: "DELIVERED",
  },
  {
    n: 7,
    buyer: "sameer",
    lines: [["PRODUCT", "Extension Board", 8]],
    daysAgo: 6,
    finalStatus: "SHIPPED",
  },
  {
    n: 8,
    buyer: "divya",
    lines: [["PRODUCT", "QHD IPS Monitor", 1]],
    daysAgo: 4,
    finalStatus: "PROCESSING",
  },
  {
    n: 9,
    buyer: "kavya",
    lines: [["PRODUCT", "Toner Cartridge", 3]],
    daysAgo: 2,
    finalStatus: "PAID",
  },
];

/** People who joined through the demo member: [email name, full name, who referred them]. */
const NETWORK: [string, string, string][] = [
  ["kavya", "Kavya Rao", "customer"],
  ["sameer", "Sameer Ali", "customer"],
  ["divya", "Divya Menon", "kavya"],
];

const PATH: OrderStatus[] = ["PLACED", "PAID", "PROCESSING", "SHIPPED", "DELIVERED", "COMPLETED"];
/** Hours after the order was placed that each step happened. */
const STEP_HOURS: Record<string, number> = {
  PLACED: 0,
  PAID: 2,
  PROCESSING: 26,
  SHIPPED: 50,
  DELIVERED: 98,
  COMPLETED: 122,
  CANCELLED: 5,
};

const email = (name: string) =>
  name === "customer" ? "customer.demo@example.com" : `${name}@demo.justreference.test`;

async function userByEmail(address: string) {
  const user = await prisma.user.findUnique({
    where: { email: address },
    select: { id: true, memberProfile: { select: { id: true } } },
  });
  if (!user) throw new Error(`Missing demo account ${address}. Run seed-demo-catalog.ts first.`);
  return user;
}

async function findListing(kind: Kind, contains: string) {
  const base = {
    deletedAt: null,
    approvalStatus: "APPROVED" as const,
    isActive: true,
    ...(contains ? { title: { contains, mode: "insensitive" as const } } : {}),
  };
  const select = { id: true, title: true } as const;
  // A service can be "price on request" (no fixed price) and cannot be ordered; products need stock.
  const found =
    kind === "PRODUCT"
      ? await prisma.product.findFirst({ where: { ...base, stock: { gt: 0 } }, select })
      : kind === "SERVICE"
        ? await prisma.service.findFirst({ where: { ...base, price: { not: null } }, select })
        : await prisma.project.findFirst({ where: base, select });
  if (!found) throw new Error(`No live ${kind} matching "${contains}". Run seed-demo-catalog.ts.`);
  return found;
}

async function ensureCommissionRules(superAdminId: string) {
  const active = await prisma.commissionRule.count({ where: { effectiveTo: null } });
  if (active > 0) {
    console.log(`Commission rules: ${active} already active, left as they are.`);
    return;
  }
  for (const appliesTo of ["PRODUCT", "SERVICE", "PROJECT"] as const) {
    for (const [level, bps] of [
      [1, 200],
      [2, 100],
    ] as const) {
      await createRuleVersion({
        level,
        appliesTo,
        rateBasis: "PERCENT_OF_ORDER",
        rateValueBps: bps,
        rateValueFixed: null,
        qualifyingEvent: "ORDER_COMPLETED",
        requiresActiveSubscription: false,
        minimumActivityCount: null,
        releaseDelayDays: 7,
        createdBy: superAdminId,
      });
    }
  }
  console.log(
    "Commission rules: added sample rates (level 1 = 2%, level 2 = 1%, released after 7 days).",
  );
}

/** Walks an order forward to `target` using the real transition rules, as the Super Admin. */
async function moveTo(orderId: string, target: OrderStatus, actor: { userId: string }) {
  const admin = { userId: actor.userId, roles: ["SUPER_ADMIN"], vendorProfileId: null };
  if (target === "CANCELLED") {
    await transitionOrderStatus(
      orderId,
      "CANCELLED",
      admin,
      "Buyer asked to cancel before payment",
    );
    return;
  }
  for (const step of PATH.slice(1, PATH.indexOf(target) + 1)) {
    await transitionOrderStatus(orderId, step, admin);
  }
}

/** Moves the dates of rows this script created back in time. Nothing else is touched. */
async function backdate(
  orderId: string,
  placedAt: Date,
  finalStatus: OrderStatus,
  releaseDelayDays: number,
) {
  const at = (status: string) =>
    new Date(Math.min(placedAt.getTime() + (STEP_HOURS[status] ?? 0) * HOUR, Date.now() - HOUR));
  const last = at(finalStatus);
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`UPDATE orders SET created_at = ${placedAt}, updated_at = ${last} WHERE id = ${orderId}::uuid`;
    await tx.$executeRaw`UPDATE order_items SET created_at = ${placedAt} WHERE order_id = ${orderId}::uuid`;
    await tx.$executeRaw`UPDATE invoices SET created_at = ${placedAt} WHERE order_id = ${orderId}::uuid`;
    for (const status of [...PATH, "CANCELLED"]) {
      await tx.$executeRaw`UPDATE order_status_history SET created_at = ${at(status)} WHERE order_id = ${orderId}::uuid AND to_status = ${status}::"OrderStatus"`;
    }
    await tx.$executeRaw`UPDATE commissions SET created_at = ${placedAt}, updated_at = ${last} WHERE order_id = ${orderId}::uuid`;
    await tx.$executeRaw`UPDATE commission_status_history SET created_at = ${placedAt} WHERE to_status = 'PENDING' AND commission_id IN (SELECT id FROM commissions WHERE order_id = ${orderId}::uuid)`;
    if (finalStatus === "COMPLETED") {
      const completedAt = at("COMPLETED");
      const releaseAt = new Date(completedAt.getTime() + releaseDelayDays * DAY);
      await tx.$executeRaw`UPDATE commissions SET release_at = ${releaseAt} WHERE order_id = ${orderId}::uuid AND status = 'ELIGIBLE'`;
      await tx.$executeRaw`UPDATE commission_status_history SET created_at = ${completedAt} WHERE to_status = 'ELIGIBLE' AND commission_id IN (SELECT id FROM commissions WHERE order_id = ${orderId}::uuid)`;
    }
  });
}

async function seedOrders(superAdminId: string, specs: OrderSpec[], keyPrefix: string) {
  const alreadySeeded = await prisma.checkout.count({
    where: { idempotencyKey: { contains: `:${keyPrefix}` } },
  });
  if (alreadySeeded > 0) {
    console.log(`Orders: ${alreadySeeded} demo checkouts already exist, none added.`);
    return;
  }

  const rule = await prisma.commissionRule.findFirst({
    where: { effectiveTo: null },
    select: { releaseDelayDays: true },
  });
  const releaseDelayDays = rule?.releaseDelayDays ?? 7;

  for (const spec of specs) {
    const buyer = await userByEmail(email(spec.buyer));
    if (!buyer.memberProfile) throw new Error(`${spec.buyer} has no member profile.`);

    const cart = await getOrCreateOpenCart(buyer.id);
    await prisma.cartItem.deleteMany({ where: { cartId: cart.id } });
    for (const [kind, contains, qty] of spec.lines) {
      const listing = await findListing(kind, contains);
      await upsertCartItemQty(cart.id, kind, listing.id, qty);
    }

    const placed = await placeOrder(buyer.id, buyer.memberProfile.id, {
      idempotencyKey: `${keyPrefix}${spec.n}`,
    });
    for (const orderId of placed.orderIds) {
      await moveTo(orderId, spec.finalStatus, { userId: superAdminId });
      const placedAt = new Date(Date.now() - spec.daysAgo * DAY);
      await backdate(orderId, placedAt, spec.finalStatus, releaseDelayDays);
    }
    console.log(`Order ${spec.n}: ${spec.buyer} -> ${spec.finalStatus} (${spec.daysAgo} days ago)`);
  }

  // Commissions whose waiting period has passed are released into the wallets through the ledger.
  const released = await releaseEligibleCommissions(new Date());
  console.log(`Commissions released to wallets: ${released}`);
}

async function seedSellerRequest(superAdminId: string) {
  const imran = await userByEmail(email("imran"));
  const existing = await prisma.vendorProfile.findUnique({
    where: { userId: imran.id },
    select: { id: true },
  });
  if (existing) {
    console.log("Seller request: Imran already has a vendor profile, none added.");
    return;
  }
  const created = await prisma.vendorProfile.create({
    data: {
      userId: imran.id,
      businessName: "Imran Hardware Mart",
      phone: "+919800000006",
      approvalStatus: "PENDING",
      createdAt: new Date(Date.now() - 2 * DAY),
    },
    select: { id: true },
  });
  await recordAudit({
    actorId: imran.id,
    action: "SELLER_APPLIED",
    entityType: "vendor_profiles",
    entityId: created.id,
    after: { businessName: "Imran Hardware Mart" },
  });
  await createNotification({
    userId: superAdminId,
    type: "SELLER_REQUEST",
    payload: { businessName: "Imran Hardware Mart", vendorProfileId: created.id },
  });
  console.log("Seller request: Imran Hardware Mart is waiting for approval.");
}

async function seedTickets() {
  const specs = [
    {
      who: "priya",
      subject: "Invoice shows the wrong billing address",
      category: "Billing",
      message: "My last invoice has an old address. Can you update it?",
      daysAgo: 3,
    },
    {
      who: "neha",
      subject: "When will my monitor order be delivered?",
      category: "Orders",
      message: "The order was marked delivered but I haven't received the monitors yet.",
      daysAgo: 1,
    },
  ];
  for (const spec of specs) {
    const user = await userByEmail(email(spec.who));
    const exists = await prisma.supportTicket.count({
      where: { userId: user.id, subject: spec.subject },
    });
    if (exists > 0) continue;
    const ticket = await createTicket({
      userId: user.id,
      subject: spec.subject,
      category: spec.category,
      priority: "NORMAL",
      message: spec.message,
    });
    const when = new Date(Date.now() - spec.daysAgo * DAY);
    await prisma.$executeRaw`UPDATE support_tickets SET created_at = ${when}, updated_at = ${when} WHERE id = ${ticket.id}::uuid`;
    await prisma.$executeRaw`UPDATE ticket_messages SET created_at = ${when} WHERE ticket_id = ${ticket.id}::uuid`;
    console.log(`Support ticket: "${spec.subject}"`);
  }
}

/** Creates the people who joined through the demo member, the same way the catalog seed makes members. */
async function seedNetwork() {
  const customerRole = await prisma.role.findFirst({ where: { code: "CUSTOMER" } });
  const now = new Date();
  const profiles = new Map<string, { id: string; path: string; userId: string }>();

  const root = await userByEmail(email("customer"));
  const rootProfile = await prisma.memberProfile.findUnique({ where: { userId: root.id } });
  if (!rootProfile)
    throw new Error("The demo member has no member profile. Run create-demo-logins.ts.");
  profiles.set("customer", { id: rootProfile.id, path: rootProfile.referralPath, userId: root.id });

  for (const [key, fullName, referrerKey] of NETWORK) {
    const address = email(key);
    const parent = profiles.get(referrerKey);
    if (!parent) throw new Error(`Referrer ${referrerKey} is missing.`);
    const user =
      (await prisma.user.findUnique({ where: { email: address } })) ??
      (await prisma.user.create({
        data: {
          id: randomUUID(),
          email: address,
          fullName,
          status: "ACTIVE",
          emailVerifiedAt: now,
        },
      }));
    let profile = await prisma.memberProfile.findUnique({ where: { userId: user.id } });
    if (!profile) {
      const created = await prisma.memberProfile.create({
        data: { userId: user.id, referredByUserId: parent.userId, referralPath: "" },
      });
      const memberId = formatMemberId(created.memberSeq);
      profile = await prisma.memberProfile.update({
        where: { id: created.id },
        data: {
          memberId,
          referralCode: memberId,
          referralPath: buildReferralPath(parent.path, created.id),
        },
      });
      await prisma.referralRelationship.create({
        data: { memberId: profile.id, referrerId: parent.id, level: 1, changedAt: now },
      });
      console.log(`Network: ${fullName} joined through ${referrerKey} (${memberId})`);
    }
    if (customerRole) {
      const hasRole = await prisma.userRole.findFirst({
        where: { userId: user.id, roleId: customerRole.id, revokedAt: null },
      });
      if (!hasRole)
        await prisma.userRole.create({ data: { userId: user.id, roleId: customerRole.id } });
    }
    profiles.set(key, { id: profile.id, path: profile.referralPath, userId: user.id });
  }

  // Moves each new member's join date back so "new referrals" has a spread over the weeks.
  const joined: [string, number][] = [
    ["kavya", 22],
    ["sameer", 18],
    ["divya", 17],
  ];
  for (const [key, daysAgo] of joined) {
    const when = new Date(Date.now() - daysAgo * DAY);
    const p = profiles.get(key)!;
    await prisma.$executeRaw`UPDATE member_profiles SET created_at = ${when} WHERE id = ${p.id}::uuid`;
    await prisma.$executeRaw`UPDATE referral_relationships SET changed_at = ${when} WHERE member_id = ${p.id}::uuid`;
  }
}

async function seedMemberTicket() {
  const user = await userByEmail(email("customer"));
  const subject = "How long do referral earnings take to reach my wallet?";
  if ((await prisma.supportTicket.count({ where: { userId: user.id, subject } })) > 0) return;
  const ticket = await createTicket({
    userId: user.id,
    subject,
    category: "Wallet",
    priority: "NORMAL",
    message: "I can see my earnings as waiting. When will they move to my wallet?",
  });
  const when = new Date(Date.now() - 2 * DAY);
  await prisma.$executeRaw`UPDATE support_tickets SET created_at = ${when}, updated_at = ${when} WHERE id = ${ticket.id}::uuid`;
  await prisma.$executeRaw`UPDATE ticket_messages SET created_at = ${when} WHERE ticket_id = ${ticket.id}::uuid`;
  console.log(`Support ticket: "${subject}"`);
}

async function main() {
  const stage = process.argv.find((a) => a.startsWith("--stage="))?.split("=")[1];
  if (stage !== "super-admin" && stage !== "member") {
    throw new Error(
      "Pass --stage=super-admin or --stage=member. Other panels get their own stage later.",
    );
  }
  const superAdmin = await userByEmail(SUPER_ADMIN_EMAIL);
  await ensureCommissionRules(superAdmin.id);

  if (stage === "super-admin") {
    await seedOrders(superAdmin.id, ORDERS, KEY_PREFIX);
    await seedSellerRequest(superAdmin.id);
    await seedTickets();
  } else {
    await seedNetwork();
    await seedOrders(superAdmin.id, MEMBER_ORDERS, "demo-activity-member-order-");
    await seedMemberTicket();
  }

  const [orders, commissions, walletTx] = await Promise.all([
    prisma.order.count(),
    prisma.commission.groupBy({ by: ["status"], _count: true }),
    prisma.walletTransaction.count(),
  ]);
  console.log("Totals now:", {
    orders,
    commissions: commissions.map((c) => `${c.status}:${c._count}`),
    walletTx,
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
