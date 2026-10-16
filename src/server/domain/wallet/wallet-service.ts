// No "server-only" import — orchestration layer; every dependency below
// already carries its own "server-only" guard. Same precedent as
// checkout-service.ts (Phase 5) and commission-service.ts (Phase 6).
import { prisma } from "@/server/lib/prisma";
import {
  creditWallet,
  debitWallet,
  getOrCreateWallet,
  getWalletByOwner,
  setWalletPinHash,
} from "@/server/repositories/wallet/wallet-repository";
import {
  hashWalletPin,
  isValidPinFormat,
  verifyWalletPin,
} from "@/server/domain/wallet/wallet-pin";
import { recordAudit } from "@/server/domain/audit/record";
import { ConflictError, RateLimitedError, ValidationError } from "@/server/lib/errors";
import { walletPinRateLimiter } from "@/server/lib/rate-limit";
import type { WalletTransactionType } from "@/generated/prisma/enums";

export interface CreditWalletInput {
  amount: bigint;
  type: WalletTransactionType;
  referenceType: string;
  referenceId: string;
  idempotencyKey: string;
}

/** Ensures a wallet exists, then credits it — used by commission-service.ts's AVAILABLE hook and by admin manual top-ups. */
export async function creditMemberWallet(userId: string, input: CreditWalletInput) {
  const wallet = await getOrCreateWallet(userId);
  return prisma.$transaction((tx) => creditWallet(tx, { walletId: wallet.id, ...input }));
}

export interface DebitWalletInput {
  amount: bigint;
  type: WalletTransactionType;
  referenceType: string;
  referenceId: string;
  idempotencyKey: string;
}

export async function debitMemberWallet(userId: string, input: DebitWalletInput) {
  const wallet = await getWalletByOwner(userId);
  if (!wallet) throw new ValidationError("No wallet found for this account.");
  return prisma.$transaction((tx) => debitWallet(tx, { walletId: wallet.id, ...input }));
}

export async function setWalletPin(userId: string, pin: string): Promise<void> {
  if (!isValidPinFormat(pin)) {
    throw new ValidationError("Enter a 6-digit PIN.");
  }
  const wallet = await getOrCreateWallet(userId);
  await setWalletPinHash(wallet.id, hashWalletPin(pin));
  await recordAudit({
    actorId: userId,
    action: "WALLET_PIN_SET",
    entityType: "wallets",
    entityId: wallet.id,
  });
}

/**
 * Replaces an existing PIN. The current PIN must be right; a member with no PIN yet has to set one
 * first. Each wrong attempt counts against a small limit so the current PIN cannot be guessed.
 */
export async function changeWalletPin(
  userId: string,
  currentPin: string,
  newPin: string,
): Promise<void> {
  if (!isValidPinFormat(newPin)) {
    throw new ValidationError("Enter a 6-digit PIN.");
  }
  const wallet = await getOrCreateWallet(userId);
  if (!wallet.walletPinHash) {
    throw new ValidationError("You haven't set a wallet PIN yet. Set one first.");
  }
  const attempt = await walletPinRateLimiter.consume(`wallet-pin:${userId}`);
  if (!attempt.allowed) {
    throw new RateLimitedError("Too many wrong PINs. Please try again in a few minutes.");
  }
  if (!verifyWalletPin(currentPin, wallet.walletPinHash)) {
    throw new ConflictError("Your current PIN is not correct.");
  }
  await setWalletPinHash(wallet.id, hashWalletPin(newPin));
  await recordAudit({
    actorId: userId,
    action: "WALLET_PIN_CHANGED",
    entityType: "wallets",
    entityId: wallet.id,
  });
}

/** Throws if a PIN is set and the supplied one doesn't match — callers must still check whether a PIN is required at all. */
export async function assertWalletPinIfSet(
  walletId: string,
  pin: string | undefined,
): Promise<void> {
  const wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } });
  if (!wallet.walletPinHash) return; // no PIN configured — nothing to check (Q-13: optional)
  if (!pin || !verifyWalletPin(pin, wallet.walletPinHash)) {
    throw new ConflictError("Incorrect wallet PIN.");
  }
}
