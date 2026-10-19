import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashWalletPin } from "@/server/domain/wallet/wallet-pin";
import { resetWalletPinSchema } from "@/lib/schemas/wallet";

/**
 * Staff resetting a member's forgotten wallet PIN, with the wallet repository and audit log replaced by
 * fakes (no live database here). What matters: the PIN is cleared (never set to a value by staff), a
 * member with no wallet or no PIN is refused, and the reset is audited with who did it and why.
 */

const mockGetWalletByOwner = vi.fn();
const mockSetWalletPinHash = vi.fn();
vi.mock("@/server/repositories/wallet/wallet-repository", () => ({
  creditWallet: vi.fn(),
  debitWallet: vi.fn(),
  getOrCreateWallet: vi.fn(),
  getWalletByOwner: mockGetWalletByOwner,
  setWalletPinHash: mockSetWalletPinHash,
}));

const mockRecordAudit = vi.fn();
vi.mock("@/server/domain/audit/record", () => ({ recordAudit: mockRecordAudit }));

vi.mock("@/server/lib/rate-limit", () => ({ walletPinRateLimiter: { consume: vi.fn() } }));
vi.mock("@/server/lib/prisma", () => ({ prisma: {} }));

const { resetWalletPinByStaff } = await import("@/server/domain/wallet/wallet-service");

beforeEach(() => vi.clearAllMocks());

describe("resetWalletPinByStaff", () => {
  it("clears the PIN and audits who did it, for which member, and why", async () => {
    mockGetWalletByOwner.mockResolvedValue({ id: "w-1", walletPinHash: hashWalletPin("123456") });

    await resetWalletPinByStaff("admin-1", "member-1", "Member forgot the PIN, ID checked on call");

    expect(mockSetWalletPinHash).toHaveBeenCalledExactlyOnceWith("w-1", null);
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "WALLET_PIN_RESET_BY_STAFF",
        actorId: "admin-1",
        entityId: "w-1",
        after: expect.objectContaining({
          hasPin: false,
          memberUserId: "member-1",
          reason: "Member forgot the PIN, ID checked on call",
        }),
      }),
    );
  });

  it("refuses a member who has no PIN and changes nothing", async () => {
    mockGetWalletByOwner.mockResolvedValue({ id: "w-1", walletPinHash: null });

    await expect(resetWalletPinByStaff("admin-1", "member-1", "reason")).rejects.toThrow(
      /nothing to reset/i,
    );
    expect(mockSetWalletPinHash).not.toHaveBeenCalled();
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });

  it("refuses a member who has no wallet", async () => {
    mockGetWalletByOwner.mockResolvedValue(null);

    await expect(resetWalletPinByStaff("admin-1", "member-1", "reason")).rejects.toThrow(
      /no wallet/i,
    );
    expect(mockSetWalletPinHash).not.toHaveBeenCalled();
  });
});

describe("resetWalletPinSchema", () => {
  it("needs a member id and a reason", () => {
    const userId = "3f2c1b9e-8a41-4d6e-9b0a-1c2d3e4f5a6b";
    expect(resetWalletPinSchema.safeParse({ userId, reason: "Forgot PIN" }).success).toBe(true);
    expect(resetWalletPinSchema.safeParse({ userId, reason: "" }).success).toBe(false);
    expect(resetWalletPinSchema.safeParse({ userId: "nope", reason: "Forgot PIN" }).success).toBe(
      false,
    );
  });
});
