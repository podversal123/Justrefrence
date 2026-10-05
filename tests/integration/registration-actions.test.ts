import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * Integration-style tests for the registration flow, mocked at the module
 * boundary — same convention as tests/integration/vendor-actions.test.ts.
 * Repositories (which carry "server-only") are mocked, same as
 * vendor-repository.ts is mocked there; the orchestration layer above them
 * (registration-service.ts, otp-service.ts, session-bridge.ts, notify.ts) is
 * real, so these tests exercise the actual referral-linking / member-id /
 * OTP-policy logic, not just the wiring.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
const mockRedirect = vi.fn();
vi.mock("next/navigation", () => ({ redirect: mockRedirect }));
vi.mock("next/headers", () => ({
  headers: vi.fn(async () => new Headers()),
}));

const mockRecordAudit = vi.fn();
vi.mock("@/server/domain/audit/record", () => ({ recordAudit: mockRecordAudit }));

const mockSendEmail = vi.fn().mockResolvedValue({ provider: "console-email", delivered: true });
const mockSendSms = vi.fn().mockResolvedValue({ provider: "console-sms", delivered: true });
const mockSendWhatsApp = vi.fn().mockResolvedValue({ provider: "console-whatsapp", delivered: true });
vi.mock("@/server/lib/notification-providers", () => ({
  sendEmail: mockSendEmail,
  sendSms: mockSendSms,
  sendWhatsApp: mockSendWhatsApp,
}));

const mockCreateUser = vi.fn();
const mockDeleteUser = vi.fn().mockResolvedValue({ data: {}, error: null });
const mockGenerateLink = vi.fn().mockResolvedValue({
  data: { properties: { hashed_token: "hashed-token-123" } },
  error: null,
});
vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: vi.fn(() => ({
    auth: {
      admin: { createUser: mockCreateUser, deleteUser: mockDeleteUser, generateLink: mockGenerateLink },
    },
  })),
}));

const mockGetUser = vi.fn();
const mockVerifyOtp = vi.fn().mockResolvedValue({ error: null });
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser, verifyOtp: mockVerifyOtp },
  })),
}));

const prismaMock = {
  user: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  userRole: { create: vi.fn() },
  $transaction: vi.fn(async (arg: unknown) => {
    if (typeof arg === "function") {
      return (arg as (tx: typeof prismaMock) => unknown)(prismaMock);
    }
    return Promise.all(arg as Promise<unknown>[]);
  }),
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

const mockGetMemberProfileByReferralCode = vi.fn();
const mockCreateMemberProfile = vi.fn();
const mockCreateReferralRelationship = vi.fn();
vi.mock("@/server/repositories/identity/member-repository", () => ({
  getMemberProfileByReferralCode: mockGetMemberProfileByReferralCode,
  createMemberProfile: mockCreateMemberProfile,
  createReferralRelationship: mockCreateReferralRelationship,
}));

const mockFindRoleByCode = vi.fn();
vi.mock("@/server/repositories/role-repository", () => ({ findRoleByCode: mockFindRoleByCode }));

const mockCreateNotification = vi.fn();
vi.mock("@/server/repositories/identity/notification-repository", () => ({
  createNotification: mockCreateNotification,
}));

// member-actions.ts statically imports getFieldEncryptionKey for the bank
// account action even though these registration tests never exercise it —
// ES module evaluation still runs field-encryption.ts's top-level
// "server-only" guard, so it needs the same mock treatment as the Supabase
// clients above.
vi.mock("@/server/lib/field-encryption", () => ({ getFieldEncryptionKey: vi.fn() }));
vi.mock("@/server/repositories/identity/address-repository", () => ({ upsertAddress: vi.fn() }));
vi.mock("@/server/repositories/identity/bank-repository", () => ({ upsertBankAccount: vi.fn() }));

const { requestRegistrationAction, confirmRegistrationAction, resendRegistrationOtpAction } =
  await import("@/server/services/member-actions");

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const VALID_REGISTRATION = {
  fullName: "Jane Doe",
  email: "jane@example.com",
  phone: "+919876543210",
  password: "Password1234",
  confirmPassword: "Password1234",
  channel: "EMAIL",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("requestRegistrationAction", () => {
  it("rejects invalid input before touching Supabase/Prisma", async () => {
    const result = await requestRegistrationAction(
      undefined,
      formData({ ...VALID_REGISTRATION, confirmPassword: "Mismatch123" }),
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("VALIDATION_ERROR");
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("rejects an unknown referral code", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    mockGetMemberProfileByReferralCode.mockResolvedValue(null);

    const result = await requestRegistrationAction(
      undefined,
      formData({ ...VALID_REGISTRATION, referralCode: "JR-999999" }),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("VALIDATION_ERROR");
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("creates the Supabase user + local pending row, sends an OTP, and redirects to verify", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    mockCreateUser.mockResolvedValue({ data: { user: { id: "new-user-1" } }, error: null });

    await requestRegistrationAction(undefined, formData(VALID_REGISTRATION));

    expect(mockCreateUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: "jane@example.com", phone: "+919876543210" }),
    );
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ id: "new-user-1", status: "PENDING_VERIFICATION" }),
      }),
    );
    expect(mockCreateOtp).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockRedirect).toHaveBeenCalledWith(
      expect.stringContaining("/register/verify?userId=new-user-1&channel=EMAIL"),
    );
  });

  it("reuses a still-pending account instead of erroring on a repeat attempt", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "pending-user-1",
      status: "PENDING_VERIFICATION",
    });

    await requestRegistrationAction(undefined, formData(VALID_REGISTRATION));

    expect(mockCreateUser).not.toHaveBeenCalled();
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "pending-user-1" } }),
    );
    expect(mockCreateOtp).toHaveBeenCalledTimes(1);
  });

  it("rejects when an ACTIVE account already owns that email", async () => {
    prismaMock.user.findUnique.mockResolvedValue({ id: "existing", status: "ACTIVE" });

    const result = await requestRegistrationAction(undefined, formData(VALID_REGISTRATION));

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("CONFLICT");
    expect(mockCreateUser).not.toHaveBeenCalled();
  });

  it("compensates by deleting the Supabase user if the local DB write fails", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);
    mockCreateUser.mockResolvedValue({ data: { user: { id: "new-user-2" } }, error: null });
    prismaMock.user.create.mockRejectedValue(new Error("db down"));

    const result = await requestRegistrationAction(undefined, formData(VALID_REGISTRATION));

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("INTERNAL_ERROR");
    expect(mockDeleteUser).toHaveBeenCalledWith("new-user-2");
  });
});

describe("confirmRegistrationAction", () => {
  const PENDING_USER = {
    id: "11111111-1111-4111-8111-111111111111",
    email: "jane@example.com",
    fullName: "Jane Doe",
    status: "PENDING_VERIFICATION",
  };

  it("rejects a malformed code before touching the OTP table", async () => {
    const result = await confirmRegistrationAction(
      undefined,
      formData({ userId: "11111111-1111-4111-8111-111111111111", code: "abc" }),
    );
    expect(result.success).toBe(false);
    expect(mockFindLatestActiveOtp).not.toHaveBeenCalled();
  });

  it("rejects an incorrect code and does not activate the account", async () => {
    prismaMock.user.findUnique.mockResolvedValue(PENDING_USER);
    mockFindLatestActiveOtp.mockResolvedValue({
      id: "otp-1",
      attemptCount: 0,
      expiresAt: new Date(Date.now() + 60_000),
      codeHash: "deadbeef",
    });

    const result = await confirmRegistrationAction(
      undefined,
      formData({ userId: "11111111-1111-4111-8111-111111111111", code: "000000" }),
    );

    expect(result.success).toBe(false);
    expect(mockIncrementOtpAttempt).toHaveBeenCalledWith("otp-1");
    expect(mockConsumeOtp).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("activates the account, creates the member profile, assigns CUSTOMER, and mints a session on a correct code", async () => {
    const { hashOtpCode } = await import("@/server/domain/identity/otp");
    const codeHash = await hashOtpCode("123456");

    prismaMock.user.findUnique.mockResolvedValue(PENDING_USER);
    mockFindLatestActiveOtp.mockResolvedValue({
      id: "otp-1",
      attemptCount: 0,
      expiresAt: new Date(Date.now() + 60_000),
      codeHash,
    });
    mockFindRoleByCode.mockResolvedValue({ id: "role-customer", code: "CUSTOMER" });
    mockCreateMemberProfile.mockResolvedValue({
      id: "member-1",
      memberId: "JR-000001",
      referralCode: "JR-000001",
    });

    await confirmRegistrationAction(undefined, formData({ userId: "11111111-1111-4111-8111-111111111111", code: "123456" }));

    expect(mockConsumeOtp).toHaveBeenCalledWith("otp-1");
    expect(prismaMock.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "11111111-1111-4111-8111-111111111111" }, data: expect.objectContaining({ status: "ACTIVE" }) }),
    );
    expect(mockCreateMemberProfile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: "11111111-1111-4111-8111-111111111111", referredByUserId: null }),
    );
    expect(mockCreateReferralRelationship).not.toHaveBeenCalled();
    expect(mockGenerateLink).toHaveBeenCalledWith({ type: "magiclink", email: "jane@example.com" });
    expect(mockVerifyOtp).toHaveBeenCalledWith({ token_hash: "hashed-token-123", type: "magiclink" });
    expect(mockRedirect).toHaveBeenCalledWith("/dashboard");
  });

  it("links the referrer and writes a referral_relationships row when a valid referral code is supplied", async () => {
    const { hashOtpCode } = await import("@/server/domain/identity/otp");
    const codeHash = await hashOtpCode("123456");

    prismaMock.user.findUnique.mockResolvedValue(PENDING_USER);
    mockFindLatestActiveOtp.mockResolvedValue({
      id: "otp-1",
      attemptCount: 0,
      expiresAt: new Date(Date.now() + 60_000),
      codeHash,
    });
    mockGetMemberProfileByReferralCode.mockResolvedValue({
      id: "referrer-member-1",
      userId: "referrer-user-1",
      referralPath: "aaaa",
      referralCode: "JR-000042",
    });
    mockFindRoleByCode.mockResolvedValue({ id: "role-customer", code: "CUSTOMER" });
    mockCreateMemberProfile.mockResolvedValue({
      id: "member-2",
      memberId: "JR-000002",
      referralCode: "JR-000002",
    });

    await confirmRegistrationAction(
      undefined,
      formData({ userId: "11111111-1111-4111-8111-111111111111", code: "123456", referralCode: "jr-000042" }),
    );

    expect(mockCreateMemberProfile).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ userId: "11111111-1111-4111-8111-111111111111", referredByUserId: "referrer-user-1" }),
    );
    expect(mockCreateReferralRelationship).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ memberId: "member-2", referrerId: "referrer-member-1" }),
    );
  });
});

describe("resendRegistrationOtpAction", () => {
  it("404s when the registration session no longer exists", async () => {
    prismaMock.user.findUnique.mockResolvedValue(null);

    const result = await resendRegistrationOtpAction(
      undefined,
      formData({ userId: "ghost", channel: "EMAIL" }),
    );

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("NOT_FOUND");
  });

  it("resends a code for a still-pending account", async () => {
    prismaMock.user.findUnique.mockResolvedValue({
      id: "11111111-1111-4111-8111-111111111111",
      email: "jane@example.com",
      phone: "+919876543210",
      status: "PENDING_VERIFICATION",
    });

    const result = await resendRegistrationOtpAction(
      undefined,
      formData({ userId: "11111111-1111-4111-8111-111111111111", channel: "EMAIL" }),
    );

    expect(result.success).toBe(true);
    expect(mockCreateOtp).toHaveBeenCalledTimes(1);
  });
});
