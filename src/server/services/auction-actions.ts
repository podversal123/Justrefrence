"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/server/auth/authorize";
import {
  cancelAuction,
  claimAuction,
  createAuction,
  finalizeIfEnded,
  placeAuctionBid,
} from "@/server/domain/auction/auction-service";
import { notifyAuction, notifyAuctionEnding } from "@/server/domain/auction/notify";
import { formatAuctionNumber } from "@/server/domain/auction/rules";
import { getMemberProfileByUserId } from "@/server/repositories/identity/member-repository";
import { prisma } from "@/server/lib/prisma";
import {
  auctionIdSchema,
  cancelAuctionSchema,
  createAuctionSchema,
  placeAuctionBidSchema,
} from "@/lib/schemas/auction";
import { recordAudit } from "@/server/domain/audit/record";
import { AuthorizationError, RateLimitedError } from "@/server/lib/errors";
import { bidRateLimiter } from "@/server/lib/rate-limit";
import { failureFrom, requestId, validationFailure } from "@/server/lib/action-helpers";
import type { ApiResult } from "@/lib/api-response";

const TAG = "auction_action_failed";

function revalidateAuction(auctionId: string) {
  revalidatePath("/auctions");
  revalidatePath(`/auctions/${auctionId}`);
  revalidatePath("/vendor/auctions");
  revalidatePath("/my-auctions");
  revalidatePath("/admin/auctions");
}

/** Only a member (someone with a member ID) can win and pay, so only members may bid. */
async function requireMember(userId: string) {
  const member = await getMemberProfileByUserId(userId);
  if (!member?.memberId) {
    throw new AuthorizationError("You need a member account to bid in auctions.");
  }
  // The profile id (a uuid), not the public Member ID: the order and commission code looks members up by it.
  return { memberProfileId: member.id };
}

export async function createAuctionAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<{ auctionId: string }>> {
  let session;
  try {
    session = await authorize("auction:create");
  } catch (error) {
    return failureFrom(TAG, error, "Only approved vendors can start an auction.");
  }

  // The listing is chosen as "KIND:id" so one dropdown can offer products, services and projects.
  const listing = String(formData.get("listing") ?? "");
  const [itemType, itemId] = listing.split(":");
  const parsed = createAuctionSchema.safeParse({
    itemType,
    itemId,
    description: formData.get("description") || undefined,
    quantity: formData.get("quantity"),
    startPriceRupees: formData.get("startPriceRupees"),
    reservePriceRupees: formData.get("reservePriceRupees") || undefined,
    minIncrementRupees: formData.get("minIncrementRupees") || undefined,
    autoExtendMinutes: formData.get("autoExtendMinutes") || undefined,
    closesAtLocal: formData.get("closesAtLocal"),
  });
  if (!parsed.success) return validationFailure("Check the auction details below.", parsed.error);

  try {
    if (!session.vendorProfileId)
      throw new AuthorizationError("You need an approved vendor profile to start an auction.");
    const vendor = await prisma.vendorProfile.findUnique({
      where: { id: session.vendorProfileId },
      select: { approvalStatus: true },
    });
    if (vendor?.approvalStatus !== "APPROVED") {
      throw new AuthorizationError("Your vendor account must be approved before you can sell.");
    }

    const limit = await bidRateLimiter.consume(`auction-create:${session.userId}`);
    if (!limit.allowed)
      throw new RateLimitedError(
        "You're creating auctions too quickly. Please wait a few minutes.",
      );

    const created = await createAuction({
      ...parsed.data,
      vendorProfileId: session.vendorProfileId,
    });
    await recordAudit({
      actorId: session.userId,
      action: "AUCTION_CREATED",
      entityType: "auctions",
      entityId: created.id,
      after: {
        number: formatAuctionNumber(created.auctionSeq),
        itemType: parsed.data.itemType,
        itemId: parsed.data.itemId,
        quantity: parsed.data.quantity,
        startPrice: parsed.data.startPrice.toString(),
        hasReserve: parsed.data.reservePrice !== null,
        closesAt: parsed.data.closesAt.toISOString(),
      },
    });
    revalidateAuction(created.id);
    return { success: true, data: { auctionId: created.id }, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom(TAG, error, "Could not start your auction.");
  }
}

export async function placeAuctionBidAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<{ extended: boolean }>> {
  let session;
  try {
    session = await authorize("auction:bid");
  } catch (error) {
    return failureFrom(TAG, error, "Sign in with a member account to bid.");
  }

  const parsed = placeAuctionBidSchema.safeParse({
    auctionId: formData.get("auctionId"),
    unitPriceRupees: formData.get("unitPriceRupees"),
  });
  if (!parsed.success) return validationFailure("Check your bid below.", parsed.error);

  try {
    await requireMember(session.userId);
    const limit = await bidRateLimiter.consume(`auction-bid:${session.userId}`);
    if (!limit.allowed)
      throw new RateLimitedError("You're bidding too quickly. Please wait a moment.");

    const result = await placeAuctionBid({
      auctionId: parsed.data.auctionId,
      bidderId: session.userId,
      unitPrice: parsed.data.unitPriceRupees,
    });

    const payload = { auctionId: parsed.data.auctionId, number: result.number };
    if (result.isFirstBid)
      await notifyAuction(result.vendorUserId, "AUCTION_BID_RECEIVED", payload);
    if (result.outbidUserId) await notifyAuction(result.outbidUserId, "AUCTION_OUTBID", payload);
    await recordAudit({
      actorId: session.userId,
      action: "AUCTION_BID_PLACED",
      entityType: "auction_bids",
      entityId: result.bidId,
      after: {
        auction: result.number,
        unitPrice: parsed.data.unitPriceRupees.toString(),
        total: result.totalPrice.toString(),
        extendedTo: result.extendedTo?.toISOString() ?? null,
      },
    });
    revalidateAuction(parsed.data.auctionId);
    return {
      success: true,
      data: { extended: result.extendedTo !== null },
      meta: { requestId: requestId() },
    };
  } catch (error) {
    return failureFrom(TAG, error, "Could not place your bid.");
  }
}

export async function cancelAuctionAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("auction:create");
  } catch (error) {
    return failureFrom(TAG, error, "You don't have permission to cancel auctions.");
  }
  const parsed = cancelAuctionSchema.safeParse({
    auctionId: formData.get("auctionId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success)
    return validationFailure("Give a short reason for cancelling.", parsed.error);

  try {
    if (!session.vendorProfileId)
      throw new AuthorizationError("You need a vendor profile to cancel auctions.");
    // Bring an ended-but-unpersisted auction up to date first, so the rule sees its real state.
    const ending = await finalizeIfEnded(parsed.data.auctionId);
    if (ending) await notifyAuctionEnding(ending);

    const result = await cancelAuction({
      auctionId: parsed.data.auctionId,
      vendorProfileId: session.vendorProfileId,
      reason: parsed.data.reason,
    });
    await Promise.all(
      result.bidderUserIds.map((userId) =>
        notifyAuction(userId, "AUCTION_CANCELLED", {
          auctionId: parsed.data.auctionId,
          number: result.number,
        }),
      ),
    );
    await recordAudit({
      actorId: session.userId,
      action: "AUCTION_CANCELLED",
      entityType: "auctions",
      entityId: parsed.data.auctionId,
      after: { auction: result.number, reason: parsed.data.reason },
    });
    revalidateAuction(parsed.data.auctionId);
    return { success: true, data: null, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom(TAG, error, "Could not cancel this auction.");
  }
}

/** The winner pays: creates the order at the winning price and returns the checkout to pay. */
export async function claimAuctionAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<{ checkoutId: string }>> {
  let session;
  try {
    session = await authorize("auction:bid");
  } catch (error) {
    return failureFrom(TAG, error, "Sign in with the winning account to pay.");
  }
  const parsed = auctionIdSchema.safeParse({ auctionId: formData.get("auctionId") });
  if (!parsed.success) return validationFailure("Invalid request.", parsed.error);

  try {
    const member = await requireMember(session.userId);
    const result = await claimAuction({
      auctionId: parsed.data.auctionId,
      winnerUserId: session.userId,
      memberId: member.memberProfileId,
    });
    await notifyAuction(result.vendorUserId, "AUCTION_PAID", {
      auctionId: parsed.data.auctionId,
      number: result.number,
    });
    await recordAudit({
      actorId: session.userId,
      action: "AUCTION_ORDER_PLACED",
      entityType: "auctions",
      entityId: parsed.data.auctionId,
      after: { auction: result.number, orderId: result.orderId, checkoutId: result.checkoutId },
    });
    // The auction page is not revalidated here: doing so would swap the pay form away before the
    // browser follows the redirect to the payment screen. The next visit reads fresh data anyway.
    revalidatePath("/orders");
    revalidatePath("/vendor/auctions");
    revalidatePath("/my-auctions");
    return {
      success: true,
      data: { checkoutId: result.checkoutId },
      meta: { requestId: requestId() },
    };
  } catch (error) {
    return failureFrom(TAG, error, "Could not place your order.");
  }
}
