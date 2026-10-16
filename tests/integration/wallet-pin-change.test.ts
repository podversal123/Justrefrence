import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashWalletPin, verifyWalletPin } from "@/server/domain/wallet/wallet-pin";
import { changeWalletPinSchema } from "@/lib/schemas/wallet";

/**
 * Changing the wallet PIN, with the wallet repository, rate limiter and audit log replaced by fakes (no
 * live database here). What matters: the current PIN must be right, wrong guesses are limited, a member
 * with no PIN is told to set one first, and a successful change stores a new hash and is audited.
 */

const mockGetOrCreateWallet = vi.fn();
const mockSetWalletPinHash = vi.fn();
vi.mock("@/server/repositories/wallet/wallet-repository", () => ({
  creditWallet: vi.fn(),
  debitWallet: vi.fn(),
  getOrCreateWallet: mockGetOrCreateWallet,
  getWalletByOwner: vi.fn(),
  setWalletPinHash: mockSetWalletPinHash,
}));

const mockRecordAudit = vi.fn();
vi.mock("@/server/domain/audit/record", () => ({ recordAudit: mockRecordAudit }));

const mockConsume = vi.fn();
vi.mock("@/server/lib/rate-limit", () => ({ walletPinRateLimiter: { consume: mockConsume } }));

vi.mock("@/server/lib/prisma", () => ({ prisma: {} }));

const { changeWalletPin } = await import("@/server/domain/wallet/wallet-service");

beforeEach(() => {
  vi.clearAllMocks();
  mockConsume.mockResolvedValue({ allowed: true });
});

describe("changeWalletPin", () => {
  it("stores a new hash and writes an audit entry when the current PIN is right", async () => {
    mockGetOrCreateWallet.mockResolvedValue({ id: "w-1", walletPinHash: hashWalletPin("123456") });

    await changeWalletPin("user-1", "123456", "654321");

    expect(mockSetWalletPinHash).toHaveBeenCalledTimes(1);
    const [walletId, newHash] = mockSetWalletPinHash.mock.calls[0]!;
    expect(walletId).toBe("w-1");
    expect(verifyWalletPin("654321", newHash)).toBe(true);
    expect(verifyWalletPin("123456", newHash)).toBe(false);
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "WALLET_PIN_CHANGED", actorId: "user-1" }),
    );
  });

  it("refuses a wrong current PIN and changes nothing", async () => {
    mockGetOrCreateWallet.mockResolvedValue({ id: "w-1", walletPinHash: hashWalletPin("123456") });

    await expect(changeWalletPin("user-1", "000000", "654321")).rejects.toThrow(/not correct/i);
    expect(mockSetWalletPinHash).not.toHaveBeenCalled();
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });

  it("stops checking once the wrong-guess limit is used up", async () => {
    mockGetOrCreateWallet.mockResolvedValue({ id: "w-1", walletPinHash: hashWalletPin("123456") });
    mockConsume.mockResolvedValue({ allowed: false });

    await expect(changeWalletPin("user-1", "123456", "654321")).rejects.toThrow(/too many/i);
    expect(mockSetWalletPinHash).not.toHaveBeenCalled();
  });

  it("tells a member with no PIN yet to set one first", async () => {
    mockGetOrCreateWallet.mockResolvedValue({ id: "w-1", walletPinHash: null });

    await expect(changeWalletPin("user-1", "123456", "654321")).rejects.toThrow(/set one first/i);
    expect(mockConsume).not.toHaveBeenCalled();
  });

  it("rejects a new PIN that is not 6 digits", async () => {
    mockGetOrCreateWallet.mockResolvedValue({ id: "w-1", walletPinHash: hashWalletPin("123456") });
    await expect(changeWalletPin("user-1", "123456", "12ab")).rejects.toThrow(/6-digit/);
  });
});

describe("changeWalletPinSchema", () => {
  const ok = { currentPin: "123456", pin: "654321", confirmPin: "654321" };

  it("accepts a valid change", () => {
    expect(changeWalletPinSchema.safeParse(ok).success).toBe(true);
  });

  it("rejects mismatched confirmation, the same PIN again, and short PINs", () => {
    expect(changeWalletPinSchema.safeParse({ ...ok, confirmPin: "111111" }).success).toBe(false);
    expect(
      changeWalletPinSchema.safeParse({ ...ok, pin: "123456", confirmPin: "123456" }).success,
    ).toBe(false);
    expect(changeWalletPinSchema.safeParse({ ...ok, currentPin: "123" }).success).toBe(false);
    expect(
      changeWalletPinSchema.safeParse({ ...ok, pin: "12345", confirmPin: "12345" }).success,
    ).toBe(false);
  });
});
