import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A Super Admin clearing another account's two-step login, with authorization, Supabase, the database,
 * the audit log and notifications replaced by fakes. What matters: only someone with the permission can,
 * a reason is required, you cannot use it on yourself, an account with nothing set up is told so, and a
 * real reset is audited with the reason and tells the account.
 */

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

const mockAuthorize = vi.fn();
vi.mock("@/server/auth/authorize", () => ({ authorize: mockAuthorize }));

const mockRemoveAll = vi.fn();
vi.mock("@/server/lib/two-step-admin", () => ({ removeAllTwoStepFactors: mockRemoveAll }));

const mockRecordAudit = vi.fn();
vi.mock("@/server/domain/audit/record", () => ({ recordAudit: mockRecordAudit }));

const mockCreateNotification = vi.fn();
vi.mock("@/server/repositories/identity/notification-repository", () => ({
  createNotification: mockCreateNotification,
}));

const mockFindUser = vi.fn();
vi.mock("@/server/lib/prisma", () => ({ prisma: { user: { findUnique: mockFindUser } } }));

const { resetTwoStepAction } = await import("@/server/services/two-step-admin-actions");

const TARGET = "3f2c1b9e-8a41-4d6e-9b0a-1c2d3e4f5a6b";
const ME = "8d1f6c2a-5b7e-4c3d-a9f0-2e4b6d8f0a1c";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthorize.mockResolvedValue({ userId: ME });
  mockFindUser.mockResolvedValue({ id: TARGET });
  mockRemoveAll.mockResolvedValue(1);
  mockCreateNotification.mockResolvedValue({});
});

describe("resetTwoStepAction", () => {
  it("removes the factors, audits who did it and why, and tells the account", async () => {
    const result = await resetTwoStepAction(
      null,
      form({ userId: TARGET, reason: "Lost phone, identity checked on a call" }),
    );

    expect(result.success).toBe(true);
    expect(mockRemoveAll).toHaveBeenCalledWith(TARGET);
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "TWO_STEP_RESET_BY_ADMIN",
        actorId: ME,
        entityId: TARGET,
        after: { reason: "Lost phone, identity checked on a call", removedFactors: 1 },
      }),
    );
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: TARGET, type: "TWO_STEP_RESET" }),
    );
  });

  it("is refused without the permission, and changes nothing", async () => {
    mockAuthorize.mockRejectedValue(new Error("nope"));

    const result = await resetTwoStepAction(null, form({ userId: TARGET, reason: "reason" }));

    expect(result.success).toBe(false);
    expect(mockRemoveAll).not.toHaveBeenCalled();
    expect(mockRecordAudit).not.toHaveBeenCalled();
  });

  it("needs a reason", async () => {
    const result = await resetTwoStepAction(null, form({ userId: TARGET, reason: " " }));
    expect(result.success).toBe(false);
    expect(mockRemoveAll).not.toHaveBeenCalled();
  });

  it("will not reset your own account", async () => {
    const result = await resetTwoStepAction(null, form({ userId: ME, reason: "reason" }));
    expect(result.success).toBe(false);
    expect(mockRemoveAll).not.toHaveBeenCalled();
  });

  it("says so when the account has no two-step login, and does not audit a reset that did not happen", async () => {
    mockRemoveAll.mockResolvedValue(0);

    const result = await resetTwoStepAction(null, form({ userId: TARGET, reason: "reason" }));

    expect(result.success).toBe(false);
    expect(mockRecordAudit).not.toHaveBeenCalled();
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("says so when the account does not exist", async () => {
    mockFindUser.mockResolvedValue(null);
    const result = await resetTwoStepAction(null, form({ userId: TARGET, reason: "reason" }));
    expect(result.success).toBe(false);
    expect(mockRemoveAll).not.toHaveBeenCalled();
  });

  it("still succeeds when the notification cannot be saved", async () => {
    mockCreateNotification.mockRejectedValue(new Error("db"));
    const result = await resetTwoStepAction(null, form({ userId: TARGET, reason: "reason" }));
    expect(result.success).toBe(true);
  });
});
