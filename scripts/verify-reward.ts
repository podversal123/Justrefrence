/**
 * End-to-end verification of paying rewards against the REAL database (not
 * mocks): cash through the wallet ledger (idempotency, concurrency, duplicate
 * guard), a coupon that only its member can use (list, checkout, one use),
 * gifts marked as given, and the derived Used / Unused / Expired status.
 * Creates throwaway users (marker domain @rewardtest.justreference.test) and
 * deletes them again, even on failure.
 *
 *   npx tsx --conditions=react-server --env-file=.env --env-file=.env.local scripts/verify-reward.ts
 */
import { randomUUID } from "node:crypto";
import { prisma } from "@/server/lib/prisma";
import { grantReward, markRewardGiven } from "@/server/domain/rewards/reward-service";
import { rewardStatus } from "@/server/domain/rewards/rules";
import { placeOrder } from "@/server/domain/commerce/checkout-service";
import {
  listRewardsForAdmin,
  listRewardsForMember,
  toRewardFacts,
} from "@/server/repositories/rewards/reward-repository";
import { listCouponsForMember } from "@/server/repositories/commerce/coupon-admin-repository";
import type { GrantRewardInput } from "@/lib/schemas/reward";

const DOMAIN = "@rewardtest.justreference.test";
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

const rupees = (n: number) => BigInt(n) * 100n;
const days = (n: number) => new Date(Date.now() + n * 86_400_000);

async function makeUser(
  name: string,
  opts: { member?: boolean; status?: "ACTIVE" | "BLOCKED" } = {},
) {
  const user = await prisma.user.create({
    data: {
      id: randomUUID(),
      email: `${name}-${randomUUID().slice(0, 8)}${DOMAIN}`,
      fullName: name,
      status: opts.status ?? "ACTIVE",
      emailVerifiedAt: new Date(),
    },
  });
  let profileId: string | null = null;
  if (opts.member !== false) {
    const member = await prisma.memberProfile.create({
      data: { userId: user.id, referralPath: "root" },
    });
    await prisma.memberProfile.update({
      where: { id: member.id },
      data: { memberId: `RT-${member.memberSeq}` },
    });
    profileId = member.id;
  }
  return { user, profileId };
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

  await prisma.couponRedemption.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.commissionStatusHistory.deleteMany({
    where: { commission: { orderId: { in: orderIds } } },
  });
  await prisma.commission.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.invoiceItem.deleteMany({ where: { invoice: { orderId: { in: orderIds } } } });
  await prisma.invoice.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderStatusHistory.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await prisma.order.deleteMany({ where: { id: { in: orderIds } } });
  await prisma.checkout.deleteMany({ where: { id: { in: checkoutIds } } });
  const carts = await prisma.cart.findMany({
    where: { ownerUserId: { in: userIds } },
    select: { id: true },
  });
  await prisma.cartItem.deleteMany({ where: { cartId: { in: carts.map((c) => c.id) } } });
  await prisma.cart.deleteMany({ where: { id: { in: carts.map((c) => c.id) } } });

  await prisma.reward.deleteMany({ where: { member: { userId: { in: userIds } } } });
  await prisma.coupon.deleteMany({ where: { createdBy: { in: userIds } } });
  const wallets = await prisma.wallet.findMany({
    where: { ownerUserId: { in: userIds } },
    select: { id: true },
  });
  await prisma.walletTransaction.deleteMany({
    where: { walletId: { in: wallets.map((w) => w.id) } },
  });
  await prisma.wallet.deleteMany({ where: { id: { in: wallets.map((w) => w.id) } } });

  await prisma.product.deleteMany({ where: { vendorId: { in: vendorIds } } });
  await prisma.productCategory.deleteMany({ where: { slug: { startsWith: "rewardtest-" } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
  await prisma.vendorProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.memberProfile.deleteMany({ where: { userId: { in: userIds } } });
  await prisma.user.deleteMany({ where: { id: { in: userIds } } });
}

async function main() {
  await cleanup(); // leftovers from an interrupted earlier run

  const admin = await makeUser("admin", { member: false });
  const ann = await makeUser("ann");
  const raj = await makeUser("raj");
  const blocked = await makeUser("blocked", { status: "BLOCKED" });
  const outsider = await makeUser("outsider", { member: false });

  const cash = (
    userId: string,
    amount: bigint,
    key = randomUUID(),
    title = "Bonus",
  ): GrantRewardInput => ({
    userId,
    title,
    reason: "Verification run",
    idempotencyKey: key,
    type: "CASH",
    amount,
  });

  // ---------------------------------------------------------------- cash
  const key1 = randomUUID();
  const first = await grantReward(admin.user.id, cash(ann.user.id, rupees(500), key1));
  check("cash reward is created", first.created && first.type === "CASH");
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { ownerUserId: ann.user.id } });
  check(
    "the wallet is credited with the exact amount",
    wallet.balance === rupees(500),
    wallet.balance,
  );
  const txn = await prisma.walletTransaction.findFirstOrThrow({ where: { walletId: wallet.id } });
  check(
    "the ledger row is a REWARD credit pointing at the reward",
    txn.type === "REWARD" && txn.referenceId === first.rewardId,
  );
  check("the ledger row records the balance after", txn.balanceAfter === rupees(500));

  const replay = await grantReward(admin.user.id, cash(ann.user.id, rupees(500), key1));
  check(
    "the same submission is a replay, not a second payment",
    !replay.created && replay.rewardId === first.rewardId,
  );
  const afterReplay = await prisma.wallet.findUniqueOrThrow({ where: { id: wallet.id } });
  check("a replay does not credit twice", afterReplay.balance === rupees(500));

  await expectReject(
    "an identical reward with a fresh key right away is refused",
    () => grantReward(admin.user.id, cash(ann.user.id, rupees(500))),
    "identical",
  );

  const burstKey = randomUUID();
  const burst = await Promise.allSettled([
    grantReward(admin.user.id, cash(raj.user.id, rupees(100), burstKey, "Burst")),
    grantReward(admin.user.id, cash(raj.user.id, rupees(100), burstKey, "Burst")),
    grantReward(admin.user.id, cash(raj.user.id, rupees(100), burstKey, "Burst")),
  ]);
  const rajWallet = await prisma.wallet.findUniqueOrThrow({ where: { ownerUserId: raj.user.id } });
  check(
    "three simultaneous identical submissions credit exactly once",
    rajWallet.balance === rupees(100),
    rajWallet.balance,
  );
  check(
    "and every one of them is answered with the same reward",
    new Set(
      burst
        .filter((r) => r.status === "fulfilled")
        .map((r) => (r as PromiseFulfilledResult<{ rewardId: string }>).value.rewardId),
    ).size === 1,
    burst.map((r) => r.status),
  );
  check(
    "only one reward row exists for that submission",
    (await prisma.reward.count({ where: { member: { userId: raj.user.id }, title: "Burst" } })) ===
      1,
  );

  await expectReject(
    "a blocked member can't be paid",
    () => grantReward(admin.user.id, cash(blocked.user.id, rupees(10))),
    "active",
  );
  await expectReject(
    "a non-member can't be paid",
    () => grantReward(admin.user.id, cash(outsider.user.id, rupees(10))),
    "not found",
  );

  // ---------------------------------------------------------------- coupon
  const couponKey = randomUUID();
  const couponInput: GrantRewardInput = {
    userId: ann.user.id,
    title: "Welcome gift",
    reason: "First order",
    idempotencyKey: couponKey,
    type: "COUPON",
    discountType: "FIXED",
    valuePercentBps: null,
    valueFixed: rupees(200),
    minOrderAmount: 0n,
    expiresAt: days(10),
  };
  const coupon = await grantReward(admin.user.id, couponInput);
  check(
    "a coupon reward returns a RWD- code",
    /^RWD-[A-Z2-9]{8}$/.test(coupon.couponCode ?? ""),
    coupon.couponCode,
  );
  const row = await prisma.coupon.findUniqueOrThrow({ where: { code: coupon.couponCode! } });
  check(
    "the coupon belongs to that member only and is single-use",
    row.assignedMemberId === ann.profileId && row.usageLimit === 1 && row.usageLimitPerMember === 1,
  );

  const annCoupons = await listCouponsForMember(ann.profileId!);
  const rajCoupons = await listCouponsForMember(raj.profileId!);
  check(
    "the member sees their coupon in My coupons",
    annCoupons.some((c) => c.code === coupon.couponCode),
  );
  check("another member does not see it", !rajCoupons.some((c) => c.code === coupon.couponCode));

  // checkout
  const category = await prisma.productCategory.create({
    data: { name: "Reward test", slug: `rewardtest-${randomUUID().slice(0, 8)}` },
  });
  const sellerUser = await makeUser("seller", { member: false });
  const vendor = await prisma.vendorProfile.create({
    data: {
      userId: sellerUser.user.id,
      businessName: "Reward Test Traders",
      approvalStatus: "APPROVED",
      approvedAt: new Date(),
    },
  });
  const product = await prisma.product.create({
    data: {
      vendorId: vendor.id,
      categoryId: category.id,
      title: "Reward test product",
      slug: `rewardtest-${randomUUID().slice(0, 12)}`,
      price: rupees(1000),
      stock: 20,
      approvalStatus: "APPROVED",
      isActive: true,
    },
  });
  const addToCart = async (userId: string) => {
    const cart = await prisma.cart.create({ data: { ownerUserId: userId, status: "OPEN" } });
    await prisma.cartItem.create({
      data: { cartId: cart.id, itemType: "PRODUCT", itemId: product.id, qty: 1 },
    });
  };

  await addToCart(raj.user.id);
  await expectReject(
    "another member using the code at checkout is told it doesn't exist",
    () =>
      placeOrder(raj.user.id, raj.profileId!, {
        idempotencyKey: randomUUID(),
        couponCode: coupon.couponCode!,
      }),
    "doesn't exist",
  );

  await addToCart(ann.user.id);
  const placed = await placeOrder(ann.user.id, ann.profileId!, {
    idempotencyKey: randomUUID(),
    couponCode: coupon.couponCode!,
  });
  const order = await prisma.order.findFirstOrThrow({ where: { id: placed.orderIds[0] } });
  check(
    "the member's checkout takes ₹200 off",
    order.discountTotal === rupees(200),
    order.discountTotal,
  );

  const annRewards = await listRewardsForMember(ann.profileId!);
  const couponReward = annRewards.find((r) => r.id === coupon.rewardId)!;
  check(
    "the coupon reward is now Used",
    rewardStatus(toRewardFacts(couponReward), new Date()) === "USED",
  );

  await addToCart(ann.user.id);
  await expectReject("the same coupon can't be used a second time", () =>
    placeOrder(ann.user.id, ann.profileId!, {
      idempotencyKey: randomUUID(),
      couponCode: coupon.couponCode!,
    }),
  );

  // expiry
  const expiring = await grantReward(admin.user.id, {
    ...couponInput,
    title: "Short coupon",
    idempotencyKey: randomUUID(),
  });
  await prisma.coupon.update({
    where: { code: expiring.couponCode! },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  const expiringRow = (await listRewardsForMember(ann.profileId!)).find(
    (r) => r.id === expiring.rewardId,
  )!;
  check(
    "a coupon past its last day shows as Expired",
    rewardStatus(toRewardFacts(expiringRow), new Date()) === "EXPIRED",
  );

  // ---------------------------------------------------------------- gift
  const gift = await grantReward(admin.user.id, {
    userId: raj.user.id,
    title: "Branded jacket",
    reason: "Top performer",
    idempotencyKey: randomUUID(),
    type: "OTHER",
    expiresAt: days(5),
  });
  const giftBefore = (await listRewardsForMember(raj.profileId!)).find(
    (r) => r.id === gift.rewardId,
  )!;
  check("a new gift is Unused", rewardStatus(toRewardFacts(giftBefore), new Date()) === "UNUSED");
  await markRewardGiven(gift.rewardId);
  const giftAfter = (await listRewardsForMember(raj.profileId!)).find(
    (r) => r.id === gift.rewardId,
  )!;
  check(
    "marking it given makes it Used",
    rewardStatus(toRewardFacts(giftAfter), new Date()) === "USED",
  );
  await expectReject(
    "it can't be marked given twice",
    () => markRewardGiven(gift.rewardId),
    "already",
  );

  const stale = await grantReward(admin.user.id, {
    userId: raj.user.id,
    title: "Old voucher",
    reason: "Expired test",
    idempotencyKey: randomUUID(),
    type: "OTHER",
    expiresAt: days(5),
  });
  await prisma.reward.update({
    where: { id: stale.rewardId },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
  await expectReject(
    "an expired gift can't be marked given",
    () => markRewardGiven(stale.rewardId),
    "expired",
  );
  await expectReject("cash can't be marked given by hand", () => markRewardGiven(first.rewardId));

  // ---------------------------------------------------------------- admin list filters
  const now = new Date();
  const used = await listRewardsForAdmin({ status: "USED", search: "ann" }, now);
  check(
    "the admin list filters by status and member",
    used.items.length >= 2 &&
      used.items.every((r) => rewardStatus(toRewardFacts(r), now) === "USED"),
  );
  const expired = await listRewardsForAdmin({ status: "EXPIRED" }, now);
  const expiredIds = new Set(expired.items.map((r) => r.id));
  check(
    "the Expired filter finds the lapsed coupon and gift",
    expiredIds.has(expiring.rewardId) && expiredIds.has(stale.rewardId),
  );
  const unused = await listRewardsForAdmin({ status: "UNUSED" }, now);
  check(
    "the Unused filter does not include used or expired ones",
    !unused.items.some((r) =>
      [gift.rewardId, expiring.rewardId, stale.rewardId, coupon.rewardId].includes(r.id),
    ),
  );
  const byType = await listRewardsForAdmin({ type: "COUPON", search: first.number }, now);
  check("search by reward number and type narrows correctly", byType.items.length === 0);
  const bySeq = await listRewardsForAdmin({ search: coupon.number }, now);
  check(
    "search by reward number finds it",
    bySeq.items.length === 1 && bySeq.items[0]?.id === coupon.rewardId,
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
