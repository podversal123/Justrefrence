import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Integration-style tests for mobile-OTP login, account-lock protection, and
 * the self-service profile/notification actions — mocked at the module
 * boundary, same convention as tests/integration/vendor-actions.test.ts.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect: mockRedirect }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const mockRecordAudit = vi.fn();
vi.mock("@/server/domain/audit/record", () => ({ recordAudit: mockRecordAudit }));

const mockSendSms = vi.fn().mockResolvedValue({ provider: "console-sms", delivered: true });
vi.mock("@/server/lib/notification-providers", () => ({
  sendEmail: vi.fn().mockResolvedValue({ provider: "console-email", delivered: true }),
  sendSms: mockSendSms,
  sendWhatsApp: vi.fn().mockResolvedValue({ provider: "console-whatsapp", delivered: true }),
}));

const mockGenerateLink = vi.fn().mockResolvedValue({
  data: { properties: { hashed_token: "hashed-token-123" } },
  error: null,
});
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({ auth: { admin: { generateLink: mockGenerateLink } } })),
}));

const mockGetUser = vi.fn();
const mockVerifyOtp = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ auth: { getUser: mockGetUser, verifyOtp: mockVerifyOtp } })),
}));

const prismaMock = {
  user: { findUnique: vi.fn(), update: vi.fn() },
};
vi.mock("@/server/lib/prisma", () => ({ prisma: prismaMock }));

const mockCreateOtp = vi.fn();
const mockFindLatestActiveOtp = vi.fn();
const mockIncrementOtpAttempt = vi.fn();
const mockConsumeOtp = vi.fn();
vi.mock("@/server/repositories/identity/otp-repository", () => ({
  createOtp: mockCreateOtp,
  findLatestActiveOtp: mockFindLatestActiveOtp,
  incrementOtpAttempt: mockIncrementOtpAttempt,
  consumeOtp: mockConsumeOtp,
}));

const mockUpdateMemberDetails = vi.fn();
vi.mock("@/server/repositories/identity/member-repository", () => ({
  updateMemberDetails: mockUpdateMemberDetails,
}));

const mockUpsertAddress = vi.fn();
vi.mock("@/server/repositories/identity/address-repository", () => ({
  upsertAddress: mockUpsertAddress,
}));

const mockUpsertBankAccount = vi.fn();
vi.mock("@/server/repositories/identity/bank-repository", () => ({
  upsertBankAccount: mockUpsertBankAccount,
}));

const mockGetFieldEncryptionKey = vi.fn(() => Buffer.alloc(32, 1));
vi.mock("@/server/lib/field-encryption", () => ({
  getFieldEncryptionKey: mockGetFieldEncryptionKey,
}));

vi.mock("@/server/repositories/role-repository", () => ({ findRoleByCode: vi.fn() }));

const mockMarkNotificationRead = vi.fn();
const mockMarkAllNotificationsRead = vi.fn();
vi.mock("@/server/repositories/identity/notification-repository", () => ({
  createNotification: vi.fn(),
  markNotificationRead: mockMarkNotificationRead,
  markAllNotificationsRead: mockMarkAllNotificationsRead,
}));

const {
  requestMobileLoginOtpAction,
  confirmMobileLoginOtpAction,
  updateMemberDetailsAction,
  upsertAddressAction,
  upsertBankAccountAction,
} = await import("@/server/services/member-actions");
const { markAllNotificationsReadAction, markNotificationReadAction } = await import(
  "@/server/services/notification-actions"
);

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const PHONE = "+919876543210";
const USER_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requestMobileLoginOtpAction", () => {
  it("always returns a generic success message, even for an unregistered number", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const result = await requestMobileLoginOtpAction(undefined, formData({ phone: PHONE }));

    expect(result.success).toBe(true);
    expect(mockCreateOtp).not.toHaveBeenCalled();
  });

  it("sends an OTP for a registered, unlocked number", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: USER_ID,
      status: "ACTIVE",
      failedLoginAttempts: 0,
      lockedUntil: null,
    });

    const result = await requestMobileLoginOtpAction(undefined, formData({ phone: PHONE }));

    expect(result.success).toBe(true);
    expect(mockCreateOtp).toHaveBeenCalledTimes(1);
    expect(mockSendSms).toHaveBeenCalledTimes(1);
  });

  it("does not send an OTP for a blocked account (but still returns the generic message)", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: USER_ID,
      status: "BLOCKED",
      failedLoginAttempts: 0,
      lockedUntil: null,
    });

    const result = await requestMobileLoginOtpAction(undefined, formData({ phone: PHONE }));

    expect(result.success).toBe(true);
    expect(mockCreateOtp).not.toHaveBeenCalled();
  });
});

describe("confirmMobileLoginOtpAction — account-lock protection", () => {
  it("rejects an unregistered number", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const result = await confirmMobileLoginOtpAction(
      undefined,
      formData({ phone: PHONE, code: "123456" }),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("UNAUTHENTICATED");
  });

  it("rejects when the account is already locked, without even checking the code", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: USER_ID,
      status: "ACTIVE",
      failedLoginAttempts: 5,
      lockedUntil: new Date(Date.now() + 60_000),
    });

    const result = await confirmMobileLoginOtpAction(
      undefined,
      formData({ phone: PHONE, code: "123456" }),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("RATE_LIMITED");
    expect(mockFindLatestActiveOtp).not.toHaveBeenCalled();
  });

  it("increments failedLoginAttempts and locks the account on the 5th consecutive wrong code", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: USER_ID,
      status: "ACTIVE",
      failedLoginAttempts: 4,
      lockedUntil: null,
    });
    mockFindLatestActiveOtp.mockResolvedValue({
      id: "otp-1",
      attemptCount: 0,
      expiresAt: new Date(Date.now() + 60_000),
      codeHash: "deadbeef",
    });

    const result = await confirmMobileLoginOtpAction(
      undefined,
      formData({ phone: PHONE, code: "000000" }),
    );

    expect(result.success).toBe(false);
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: expect.objectContaining({ failedLoginAttempts: 5, lockedUntil: expect.any(Date) }),
      }),
    );
    expect(mockRecordAudit).toHaveBeenCalledWith(expect.objectContaining({ action: "LOGIN_FAILED" }));
  });

  it("resets the lock counter and mints a session on a correct code", async () => {
    const { hashOtpCode } = await import("@/server/domain/identity/otp");
    const codeHash = await hashOtpCode("123456");

    prismaMock.user.findUnique.mockResolvedValue({
      id: USER_ID,
      email: "jane@example.com",
      status: "ACTIVE",
      failedLoginAttempts: 2,
      lockedUntil: null,
    });
    mockFindLatestActiveOtp.mockResolvedValue({
      id: "otp-1",
      attemptCount: 0,
      expiresAt: new Date(Date.now() + 60_000),
      codeHash,
    });

    await confirmMobileLoginOtpAction(undefined, formData({ phone: PHONE, code: "123456" }));

    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: USER_ID },
        data: { failedLoginAttempts: 0, lockedUntil: null },
      }),
    );
    expect(mockGenerateLink).toHaveBeenCalledWith({ type: "magiclink", email: "jane@example.com" });
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard");
  });
});

describe("self-service profile actions — always scoped to the caller's own session", () => {
  it("updateMemberDetailsAction requires authentication", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await updateMemberDetailsAction(undefined, formData({ fullName: "Jane Doe" }));

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("UNAUTHENTICATED");
    expect(mockUpdateMemberDetails).not.toHaveBeenCalled();
  });

  it("updateMemberDetailsAction updates only the caller's own member profile", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });

    const result = await updateMemberDetailsAction(
      undefined,
      formData({ fullName: "Jane Doe", pan: "ABCDE1234F" }),
    );

    expect(result.success).toBe(true);
    expect(mockUpdateMemberDetails).toHaveBeenCalledWith(
      USER_ID,
      expect.objectContaining({ fullName: "Jane Doe", pan: "ABCDE1234F" }),
    );
  });

  it("upsertAddressAction ignores a client-supplied owner id and uses the session instead", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });

    const result = await upsertAddressAction(
      undefined,
      formData({
        type: "RESIDENCE",
        line1: "123 Main St",
        city: "Mumbai",
        state: "MH",
        postalCode: "400001",
        country: "IN",
        // A tampering attempt — never read by the action.
        ownerUserId: "someone-elses-id",
      }),
    );

    expect(result.success).toBe(true);
    expect(mockUpsertAddress).toHaveBeenCalledWith(USER_ID, expect.objectContaining({ city: "Mumbai" }));
  });

  it("upsertBankAccountAction encrypts the account number and only stores the masked form", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });

    const result = await upsertBankAccountAction(
      undefined,
      formData({
        accountHolderName: "Jane Doe",
        accountNumber: "001234567890",
        ifsc: "HDFC0001234",
      }),
    );

    expect(result.success).toBe(true);
    expect(mockUpsertBankAccount).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: USER_ID,
        accountNoMasked: "********7890",
        accountNoEncrypted: expect.any(Buffer),
      }),
    );
    // The raw account number must never be passed through as the masked value.
    const call = mockUpsertBankAccount.mock.calls[0]?.[0];
    expect(call.accountNoEncrypted.toString("utf8")).not.toContain("001234567890");
  });
});

describe("notification actions", () => {
  it("markNotificationReadAction requires authentication", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });

    const result = await markNotificationReadAction(
      undefined,
      formData({ notificationId: "notif-1" }),
    );

    expect(result.success).toBe(false);
    expect(mockMarkNotificationRead).not.toHaveBeenCalled();
  });

  it("markNotificationReadAction scopes the update to the caller", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });

    await markNotificationReadAction(undefined, formData({ notificationId: "notif-1" }));

    expect(mockMarkNotificationRead).toHaveBeenCalledWith(USER_ID, "notif-1");
  });

  it("markAllNotificationsReadAction scopes the update to the caller", async () => {
    mockGetUser.mockResolvedValue({ data: { user: { id: USER_ID } } });

    await markAllNotificationsReadAction(undefined, new FormData());

    expect(mockMarkAllNotificationsRead).toHaveBeenCalledWith(USER_ID);
  });
});
