"use server";

import { revalidatePath } from "next/cache";
import { authorize } from "@/server/auth/authorize";
import { setWalletPin, creditMemberWallet } from "@/server/domain/wallet/wallet-service";
import { requestPayout, transitionPayoutStatus } from "@/server/domain/wallet/payout-service";
import { verifyBankAccount } from "@/server/repositories/identity/bank-repository";
import {
  walletPinSchema,
  requestPayoutSchema,
  updatePayoutStatusSchema,
  adminCreditWalletSchema,
} from "@/lib/schemas/wallet";
import { recordAudit } from "@/server/domain/audit/record";
import { prisma } from "@/server/lib/prisma";
import { getWalletByOwner } from "@/server/repositories/wallet/wallet-repository";
import { scopedIdempotencyKey } from "@/server/lib/idempotency";
import { AppError, ConflictError } from "@/server/lib/errors";
import { logger } from "@/server/lib/logger";
import type { ApiResult } from "@/lib/api-response";

/**
 * Wallet Server Actions. `wallet:transfer` deliberately has NO action here
 * — member-to-member transfer is legal-gated and not implemented/enabled,
 * see docs/business-rules.md Q-10 and docs/adr/0015-wallet-epin-subscription.md.
 */

const DUPLICATE_TOPUP_WINDOW_MS = 60_000;

function requestId() {
  return crypto.randomUUID();
}

function failureFrom(
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): ApiResult<never> {
  if (error instanceof AppError) {
    return {
      success: false,
      error: { code: error.code, message: error.message, details: error.details },
      meta: { requestId: requestId() },
    };
  }
  logger.error("wallet_action_failed", {
    message: error instanceof Error ? error.message : String(error),
  });
  return {
    success: false,
    error: { code: "INTERNAL_ERROR", message: fallback },
    meta: { requestId: requestId() },
  };
}

export async function setWalletPinAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("wallet_pin:set");
  } catch (error) {
    return failureFrom(error, "You don't have permission to set a wallet PIN.");
  }

  const parsed = walletPinSchema.safeParse({
    pin: formData.get("pin"),
    confirmPin: formData.get("confirmPin"),
  });
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Check the PIN fields below.",
        details: parsed.error.flatten(),
      },
      meta: { requestId: requestId() },
    };
  }

  try {
    await setWalletPin(session.userId, parsed.data.pin);
  } catch (error) {
    return failureFrom(error, "Could not set your wallet PIN.");
  }

  revalidatePath("/wallet");
  return { success: true, data: null, meta: { requestId: requestId() } };
}

export async function requestPayoutAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<{ payoutRequestId: string }>> {
  let session;
  try {
    session = await authorize("payout:request");
  } catch (error) {
    return failureFrom(error, "You don't have permission to request a payout.");
  }

  const parsed = requestPayoutSchema.safeParse({
    bankAccountId: formData.get("bankAccountId"),
    amountRupees: formData.get("amountRupees"),
    idempotencyKey: formData.get("idempotencyKey"),
    walletPin: formData.get("walletPin") || undefined,
  });
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Check the payout fields below.",
        details: parsed.error.flatten(),
      },
      meta: { requestId: requestId() },
    };
  }

  try {
    const request = await requestPayout(session.userId, {
      bankAccountId: parsed.data.bankAccountId,
      amount: BigInt(Math.round(parsed.data.amountRupees * 100)),
      idempotencyKey: parsed.data.idempotencyKey,
      walletPin: parsed.data.walletPin,
    });
    revalidatePath("/wallet");
    return {
      success: true,
      data: { payoutRequestId: request.id },
      meta: { requestId: requestId() },
    };
  } catch (error) {
    return failureFrom(error, "Could not submit your payout request.");
  }
}

export async function updatePayoutStatusAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("payout:approve");
  } catch (error) {
    return failureFrom(error, "You don't have permission to manage payouts.");
  }

  const parsed = updatePayoutStatusSchema.safeParse({
    payoutRequestId: formData.get("payoutRequestId"),
    status: formData.get("status"),
    rejectedReason: formData.get("rejectedReason") || undefined,
    transferReference: formData.get("transferReference") || undefined,
    tdsDeductedRupees: formData.get("tdsDeductedRupees") || undefined,
  });
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid payout update.",
        details: parsed.error.flatten(),
      },
      meta: { requestId: requestId() },
    };
  }

  try {
    await transitionPayoutStatus(
      parsed.data.payoutRequestId,
      parsed.data.status,
      { userId: session.userId, role: session.roles.includes("FINANCE") ? "FINANCE" : "ADMIN" },
      {
        rejectedReason: parsed.data.rejectedReason,
        transferReference: parsed.data.transferReference,
        tdsDeducted:
          parsed.data.tdsDeductedRupees !== undefined
            ? BigInt(Math.round(parsed.data.tdsDeductedRupees * 100))
            : undefined,
      },
    );
  } catch (error) {
    return failureFrom(error, "Could not update the payout.");
  }

  revalidatePath("/admin/payouts");
  return { success: true, data: null, meta: { requestId: requestId() } };
}

/** FINANCE/ADMIN-only manual top-up recording — see docs/adr/0013/0015 for why there's no self-service top-up (no live payment gateway yet). */
export async function adminCreditWalletAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("wallet:topup");
  } catch (error) {
    return failureFrom(error, "You don't have permission to credit a wallet.");
  }

  const parsed = adminCreditWalletSchema.safeParse({
    userId: formData.get("userId"),
    amountRupees: formData.get("amountRupees"),
    reference: formData.get("reference"),
    idempotencyKey: formData.get("idempotencyKey"),
  });
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Check the top-up fields below.",
        details: parsed.error.flatten(),
      },
      meta: { requestId: requestId() },
    };
  }

  try {
    const amount = BigInt(Math.round(parsed.data.amountRupees * 100));

    // Key-independent double-submit guard: the same admin crediting the same
    // wallet the same amount within the window is almost certainly a
    // duplicate click/retry, even if the client minted a fresh key.
    const targetWallet = await getWalletByOwner(parsed.data.userId);
    if (targetWallet) {
      const duplicate = await prisma.walletTransaction.findFirst({
        where: {
          walletId: targetWallet.id,
          type: "TOPUP",
          referenceType: "MANUAL_TOPUP",
          referenceId: session.userId,
          amount,
          createdAt: { gte: new Date(Date.now() - DUPLICATE_TOPUP_WINDOW_MS) },
        },
        select: { id: true },
      });
      if (duplicate) {
        throw new ConflictError(
          "An identical top-up was just recorded for this wallet. Check the balance before retrying.",
        );
      }
    }

    await creditMemberWallet(parsed.data.userId, {
      amount,
      type: "TOPUP",
      referenceType: "MANUAL_TOPUP",
      referenceId: session.userId,
      idempotencyKey: scopedIdempotencyKey(
        "admin-topup",
        session.userId,
        parsed.data.idempotencyKey,
      ),
    });
  } catch (error) {
    return failureFrom(error, "Could not credit that wallet.");
  }

  revalidatePath("/admin/wallets");
  return { success: true, data: null, meta: { requestId: requestId() } };
}

/** Admin-only KYC gate — a bank account must be verified before it's eligible for payouts (see payout-eligibility.ts). */
export async function verifyBankAccountAction(
  _prevState: unknown,
  formData: FormData,
): Promise<ApiResult<null>> {
  let session;
  try {
    session = await authorize("bank_account:verify");
  } catch (error) {
    return failureFrom(error, "You don't have permission to verify bank accounts.");
  }

  const bankAccountId = String(formData.get("bankAccountId") ?? "");
  if (!bankAccountId) {
    return {
      success: false,
      error: { code: "VALIDATION_ERROR", message: "Missing bank account id." },
      meta: { requestId: requestId() },
    };
  }

  try {
    await verifyBankAccount(bankAccountId, session.userId);
  } catch (error) {
    return failureFrom(error, "Could not verify that bank account.");
  }

  await recordAudit({
    actorId: session.userId,
    action: "BANK_ACCOUNT_VERIFIED",
    entityType: "bank_accounts",
    entityId: bankAccountId,
  });

  revalidatePath("/admin/wallets");
  return { success: true, data: null, meta: { requestId: requestId() } };
}

/** Q-10: member-to-member transfer is legal-gated — see the module doc comment above. */
export async function transferWalletFundsAction(): Promise<ApiResult<null>> {
  return {
    success: false,
    error: {
      code: "FORBIDDEN",
      message:
        "Wallet-to-wallet transfers are not yet enabled, pending legal review (docs/business-rules.md Q-10).",
    },
    meta: { requestId: requestId() },
  };
}
