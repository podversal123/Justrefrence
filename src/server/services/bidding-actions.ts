"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/server/auth/authorize";
import {
  awardBid,
  cancelRequirement,
  createRequirement,
  placeBid,
  withdrawBid,
} from "@/server/domain/bidding/bidding-service";
import { formatRequirementNumber } from "@/server/domain/bidding/rules";
import { createNotification } from "@/server/repositories/identity/notification-repository";
import { prisma } from "@/server/lib/prisma";
import {
  awardBidSchema,
  bidActionSchema,
  cancelRequirementSchema,
  createRequirementSchema,
  placeBidSchema,
} from "@/lib/schemas/bidding";
import { recordAudit } from "@/server/domain/audit/record";
import { AuthorizationError, RateLimitedError } from "@/server/lib/errors";
import { bidRateLimiter } from "@/server/lib/rate-limit";
import { failureFrom, requestId, validationFailure } from "@/server/lib/action-helpers";
import type { ApiResult } from "@/lib/api-response";

const TAG = "bidding_action_failed";

function revalidateRequirement(requirementId: string) {
  revalidatePath("/bids");
  revalidatePath(`/bids/${requirementId}`);
  revalidatePath("/requirements");
  revalidatePath(`/requirements/${requirementId}`);
  revalidatePath("/my-bids");
  revalidatePath("/admin/bids");
}

/** Notifications are a courtesy: a failure to deliver one never undoes the bid or award it describes. */
async function notify(userId: string, type: string, payload: Record<string, string | number>) {
  await createNotification({ userId, type, payload }).catch(() => undefined);
}

export async function createRequirementAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<{ requirementId: string }>> {
  let session;
  try {
    session = await authorize("requirement:create");
  } catch (error) {
    return failureFrom(TAG, error, "You don't have permission to post a requirement.");
  }

  const parsed = createRequirementSchema.safeParse({
    title: formData.get("title"),
    description: formData.get("description"),
    itemKind: formData.get("itemKind"),
    categoryLabel: formData.get("categoryLabel") || undefined,
    quantity: formData.get("quantity"),
    unit: formData.get("unit") || undefined,
    deliveryCity: formData.get("deliveryCity") || undefined,
    maxBudgetRupees: formData.get("maxBudgetRupees") || undefined,
    type: formData.get("type"),
    closesAtLocal: formData.get("closesAtLocal"),
    minDecrementRupees: formData.get("minDecrementRupees") || undefined,
    autoExtendMinutes: formData.get("autoExtendMinutes") || undefined,
  });
  if (!parsed.success)
    return validationFailure("Check the requirement details below.", parsed.error);

  try {
    const limit = await bidRateLimiter.consume(`requirement:${session.userId}`);
    if (!limit.allowed)
      throw new RateLimitedError(
        "You're posting requirements too quickly. Please wait a few minutes.",
      );

    const created = await createRequirement(session.userId, parsed.data);
    await recordAudit({
      actorId: session.userId,
      action: "REQUIREMENT_POSTED",
      entityType: "requirements",
      entityId: created.id,
      after: {
        number: formatRequirementNumber(created.reqSeq),
        type: parsed.data.type,
        quantity: parsed.data.quantity,
        closesAt: parsed.data.closesAt.toISOString(),
        maxBudget: parsed.data.estimatedValue?.toString() ?? null,
      },
    });
    revalidatePath("/bids");
    revalidatePath("/requirements");
    return { success: true, data: { requirementId: created.id }, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom(TAG, error, "Could not post your requirement.");
  }
}

export async function placeBidAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<{ rank: number; extended: boolean }>> {
  let session;
  try {
    session = await authorize("bid:submit");
  } catch (error) {
    return failureFrom(TAG, error, "Only approved vendors can place bids.");
  }

  const parsed = placeBidSchema.safeParse({
    requirementId: formData.get("requirementId"),
    unitPriceRupees: formData.get("unitPriceRupees"),
    deliveryDays: formData.get("deliveryDays"),
    note: formData.get("note") || undefined,
  });
  if (!parsed.success) return validationFailure("Check your bid below.", parsed.error);

  try {
    if (!session.vendorProfileId)
      throw new AuthorizationError("You need an approved vendor profile to bid.");
    const vendor = await prisma.vendorProfile.findUnique({
      where: { id: session.vendorProfileId },
      select: { approvalStatus: true },
    });
    if (vendor?.approvalStatus !== "APPROVED") {
      throw new AuthorizationError("Your vendor account must be approved before you can bid.");
    }

    const limit = await bidRateLimiter.consume(`bid:${session.userId}`);
    if (!limit.allowed)
      throw new RateLimitedError("You're bidding too quickly. Please wait a moment.");

    const result = await placeBid({
      requirementId: parsed.data.requirementId,
      vendorProfileId: session.vendorProfileId,
      vendorUserId: session.userId,
      unitPrice: parsed.data.unitPriceRupees,
      deliveryDays: parsed.data.deliveryDays,
      note: parsed.data.note ?? null,
    });

    const number = formatRequirementNumber(result.reqSeq);
    if (result.isFirstBid) {
      await notify(result.buyerId, "BID_RECEIVED", {
        requirementId: parsed.data.requirementId,
        number,
      });
    }
    if (result.outbidVendorUserId) {
      await notify(result.outbidVendorUserId, "OUTBID", {
        requirementId: parsed.data.requirementId,
        number,
      });
    }
    await recordAudit({
      actorId: session.userId,
      action: "BID_PLACED",
      entityType: "bids",
      entityId: result.bidId,
      after: {
        requirement: number,
        unitPrice: parsed.data.unitPriceRupees.toString(),
        total: result.totalPrice.toString(),
        deliveryDays: parsed.data.deliveryDays,
        extendedTo: result.extendedTo?.toISOString() ?? null,
      },
    });
    revalidateRequirement(parsed.data.requirementId);
    return {
      success: true,
      data: { rank: result.rank, extended: result.extendedTo !== null },
      meta: { requestId: requestId() },
    };
  } catch (error) {
    return failureFrom(TAG, error, "Could not place your bid.");
  }
}

export async function withdrawBidAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("bid:submit");
  } catch (error) {
    return failureFrom(TAG, error, "Only approved vendors can manage bids.");
  }
  const parsed = bidActionSchema.safeParse({ requirementId: formData.get("requirementId") });
  if (!parsed.success) return validationFailure("Invalid request.", parsed.error);

  try {
    if (!session.vendorProfileId)
      throw new AuthorizationError("You need a vendor profile to manage bids.");
    await withdrawBid({
      requirementId: parsed.data.requirementId,
      vendorProfileId: session.vendorProfileId,
    });
    await recordAudit({
      actorId: session.userId,
      action: "BID_WITHDRAWN",
      entityType: "requirements",
      entityId: parsed.data.requirementId,
    });
    revalidateRequirement(parsed.data.requirementId);
    return { success: true, data: null, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom(TAG, error, "Could not withdraw your bid.");
  }
}

export async function awardBidAction(_prev: unknown, formData: FormData): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("bid:accept");
  } catch (error) {
    return failureFrom(TAG, error, "You don't have permission to award bids.");
  }
  const parsed = awardBidSchema.safeParse({
    requirementId: formData.get("requirementId"),
    bidId: formData.get("bidId"),
  });
  if (!parsed.success) return validationFailure("Invalid request.", parsed.error);

  try {
    const result = await awardBid({ ...parsed.data, buyerId: session.userId });
    const number = formatRequirementNumber(result.reqSeq);
    await notify(result.winnerUserId, "BID_AWARDED", {
      requirementId: parsed.data.requirementId,
      number,
    });
    await Promise.all(
      result.rejectedUserIds.map((userId) =>
        notify(userId, "BID_NOT_SELECTED", { requirementId: parsed.data.requirementId, number }),
      ),
    );
    await recordAudit({
      actorId: session.userId,
      action: "BID_AWARDED",
      entityType: "requirements",
      entityId: parsed.data.requirementId,
      after: {
        requirement: number,
        bidId: parsed.data.bidId,
        total: result.winningTotal.toString(),
      },
    });
    revalidateRequirement(parsed.data.requirementId);
    return { success: true, data: null, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom(TAG, error, "Could not award this bid.");
  }
}

export async function cancelRequirementAction(
  _prev: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("requirement:create");
  } catch (error) {
    return failureFrom(TAG, error, "You don't have permission to cancel requirements.");
  }
  const parsed = cancelRequirementSchema.safeParse({
    requirementId: formData.get("requirementId"),
    reason: formData.get("reason"),
  });
  if (!parsed.success)
    return validationFailure("Give a short reason for cancelling.", parsed.error);

  try {
    const result = await cancelRequirement({ ...parsed.data, buyerId: session.userId });
    const number = formatRequirementNumber(result.reqSeq);
    await Promise.all(
      result.bidderUserIds.map((userId) =>
        notify(userId, "REQUIREMENT_CANCELLED", {
          requirementId: parsed.data.requirementId,
          number,
        }),
      ),
    );
    await recordAudit({
      actorId: session.userId,
      action: "REQUIREMENT_CANCELLED",
      entityType: "requirements",
      entityId: parsed.data.requirementId,
      after: { requirement: number, reason: parsed.data.reason },
    });
    revalidateRequirement(parsed.data.requirementId);
    return { success: true, data: null, meta: { requestId: requestId() } };
  } catch (error) {
    return failureFrom(TAG, error, "Could not cancel this requirement.");
  }
}
