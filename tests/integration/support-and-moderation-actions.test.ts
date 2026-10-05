import { describe, expect, it, vi, beforeEach } from "vitest";
import { AuthorizationError } from "@/server/lib/errors";
import type { AuthSession } from "@/server/auth/session";
import type { Permission } from "@/server/auth/permissions";

/**
 * Wiring tests for the support-ticket, internal-message and member-moderation
 * Server Actions (Prisma / session mocked at the module boundary, same
 * convention as vendor-actions.test.ts). They pin the access rules that
 * matter: ownership is enforced separately from permission, staff powers are
 * staff-only, closed tickets stay closed, and staff accounts / self cannot be
 * blocked.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const mockRecordAudit = vi.fn();
vi.mock("@/server/domain/audit/record", () => ({ recordAudit: mockRecordAudit }));

const mockAuthorize = vi.fn();
vi.mock("@/server/auth/authorize", () => ({ authorize: mockAuthorize }));

const mockGetAuthSession = vi.fn();
vi.mock("@/server/auth/session", () => ({ getAuthSession: mockGetAuthSession }));

vi.mock("@/server/lib/rate-limit", () => ({
  contentRateLimiter: { consume: vi.fn(async () => ({ allowed: true, remaining: 10, resetAt: 0 })) },
  feedbackRateLimiter: { consume: vi.fn(async () => ({ allowed: true, remaining: 10, resetAt: 0 })) },
}));

const mockCreateNotification = vi.fn().mockResolvedValue(undefined);
vi.mock("@/server/repositories/identity/notification-repository", () => ({
  createNotification: mockCreateNotification,
}));

const ticketRepo = {
  createTicket: vi.fn(),
  getTicketWithMessages: vi.fn(),
  addReply: vi.fn(),
  setTicketStatus: vi.fn(),
  formatTicketNo: (n: number) => `TKT-${n}`,
};
vi.mock("@/server/repositories/support/ticket-repository", () => ticketRepo);

const messageRepo = {
  createMessage: vi.fn(),
  getMessage: vi.fn(),
  markMessageRead: vi.fn(),
};
vi.mock("@/server/repositories/support/message-repository", () => messageRepo);

const memberAdminRepo = { isStaffAccount: vi.fn(), setUserStatus: vi.fn() };
vi.mock("@/server/repositories/identity/member-admin-repository", () => memberAdminRepo);

const prismaMock = { user: { findUnique: vi.fn() } };
vi.mock("@/server/lib/prisma", () => ({ prisma: prismaMock }));

const { replyToTicketAction, updateTicketStatusAction } = await import("@/server/services/support-actions");
const { sendMessageAction, markMessageReadAction } = await import("@/server/services/message-actions");
const { moderateMemberAction } = await import("@/server/services/member-moderation-actions");

const TICKET_ID = "11111111-1111-4111-8111-111111111111";
const OWNER = "22222222-2222-4222-8222-222222222222";
const OTHER = "33333333-3333-4333-8333-333333333333";
const STAFF = "44444444-4444-4444-8444-444444444444";
const TARGET = "55555555-5555-4555-8555-555555555555";

function session(userId: string, permissions: Permission[]): AuthSession {
  return {
    userId,
    email: `${userId}@example.com`,
    fullName: "Test",
    status: "ACTIVE",
    roles: [],
    permissions: new Set(permissions),
    hasVendorProfile: false,
    vendorProfileId: null,
  };
}

const MEMBER_PERMS: Permission[] = ["ticket:create", "ticket:read", "message:send", "message:read"];
const STAFF_PERMS: Permission[] = [
  ...MEMBER_PERMS,
  "ticket:read:any",
  "ticket:respond",
  "ticket:close",
  "member:read:any",
  "member:block",
  "member:unblock",
];

function formData(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

function openTicket(overrides: Record<string, unknown> = {}) {
  return { id: TICKET_ID, ticketNo: 7, userId: OWNER, status: "OPEN", messages: [], ...overrides };
}

beforeEach(() => {
  vi.clearAllMocks();
  ticketRepo.addReply.mockResolvedValue(true);
  ticketRepo.setTicketStatus.mockResolvedValue(true);
  memberAdminRepo.isStaffAccount.mockResolvedValue(false);
  memberAdminRepo.setUserStatus.mockResolvedValue(true);
});

describe("replyToTicketAction", () => {
  it("lets the owner reply, as a member reply (not staff)", async () => {
    mockGetAuthSession.mockResolvedValue(session(OWNER, MEMBER_PERMS));
    ticketRepo.getTicketWithMessages.mockResolvedValue(openTicket());

    const result = await replyToTicketAction(undefined, formData({ ticketId: TICKET_ID, body: "Any update?" }));

    expect(result.success).toBe(true);
    expect(ticketRepo.addReply).toHaveBeenCalledWith(expect.objectContaining({ isStaffReply: false, authorId: OWNER }));
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("treats someone else's ticket exactly like a missing one (no probing)", async () => {
    mockGetAuthSession.mockResolvedValue(session(OTHER, MEMBER_PERMS));
    ticketRepo.getTicketWithMessages.mockResolvedValue(openTicket());

    const result = await replyToTicketAction(undefined, formData({ ticketId: TICKET_ID, body: "hi" }));

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("NOT_FOUND");
    expect(ticketRepo.addReply).not.toHaveBeenCalled();
  });

  it("lets staff reply as the team and notifies the ticket owner", async () => {
    mockGetAuthSession.mockResolvedValue(session(STAFF, STAFF_PERMS));
    ticketRepo.getTicketWithMessages.mockResolvedValue(openTicket());

    const result = await replyToTicketAction(undefined, formData({ ticketId: TICKET_ID, body: "On it." }));

    expect(result.success).toBe(true);
    expect(ticketRepo.addReply).toHaveBeenCalledWith(expect.objectContaining({ isStaffReply: true }));
    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: OWNER, type: "TICKET_REPLY" }));
  });

  it("refuses a reply on a closed ticket", async () => {
    mockGetAuthSession.mockResolvedValue(session(OWNER, MEMBER_PERMS));
    ticketRepo.getTicketWithMessages.mockResolvedValue(openTicket({ status: "CLOSED" }));

    const result = await replyToTicketAction(undefined, formData({ ticketId: TICKET_ID, body: "hello?" }));

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("CONFLICT");
    expect(ticketRepo.addReply).not.toHaveBeenCalled();
  });

  it("reports a conflict (and sends nothing) when the ticket was closed concurrently", async () => {
    mockGetAuthSession.mockResolvedValue(session(OWNER, MEMBER_PERMS));
    ticketRepo.getTicketWithMessages.mockResolvedValue(openTicket());
    ticketRepo.addReply.mockResolvedValue(false);

    const result = await replyToTicketAction(undefined, formData({ ticketId: TICKET_ID, body: "late" }));

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("CONFLICT");
  });
});

describe("updateTicketStatusAction", () => {
  it("lets a member close their OWN ticket", async () => {
    mockGetAuthSession.mockResolvedValue(session(OWNER, MEMBER_PERMS));
    ticketRepo.getTicketWithMessages.mockResolvedValue(openTicket());

    const result = await updateTicketStatusAction(undefined, formData({ ticketId: TICKET_ID, status: "CLOSED" }));

    expect(result.success).toBe(true);
    expect(ticketRepo.setTicketStatus).toHaveBeenCalledWith(TICKET_ID, "CLOSED");
  });

  it("does not let a member mark their own ticket resolved (staff action)", async () => {
    mockGetAuthSession.mockResolvedValue(session(OWNER, MEMBER_PERMS));
    ticketRepo.getTicketWithMessages.mockResolvedValue(openTicket());

    const result = await updateTicketStatusAction(undefined, formData({ ticketId: TICKET_ID, status: "RESOLVED" }));

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("FORBIDDEN");
    expect(ticketRepo.setTicketStatus).not.toHaveBeenCalled();
  });

  it("does not let a stranger close someone else's ticket", async () => {
    mockGetAuthSession.mockResolvedValue(session(OTHER, MEMBER_PERMS));
    ticketRepo.getTicketWithMessages.mockResolvedValue(openTicket());

    const result = await updateTicketStatusAction(undefined, formData({ ticketId: TICKET_ID, status: "CLOSED" }));

    expect(result.success).toBe(false);
    expect(ticketRepo.setTicketStatus).not.toHaveBeenCalled();
  });

  it("lets staff resolve any ticket", async () => {
    mockGetAuthSession.mockResolvedValue(session(STAFF, STAFF_PERMS));
    ticketRepo.getTicketWithMessages.mockResolvedValue(openTicket());

    const result = await updateTicketStatusAction(undefined, formData({ ticketId: TICKET_ID, status: "RESOLVED" }));

    expect(result.success).toBe(true);
  });
});

describe("sendMessageAction", () => {
  it("members can only write to the team — a smuggled recipient is ignored", async () => {
    mockAuthorize.mockResolvedValue(session(OWNER, MEMBER_PERMS));
    messageRepo.createMessage.mockResolvedValue({ id: "m1" });

    const result = await sendMessageAction(
      undefined,
      formData({ toUserId: OTHER, subject: "Question", body: "Hello team" }),
    );

    expect(result.success).toBe(true);
    expect(messageRepo.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({ toUserId: null, toStaff: true, fromUserId: OWNER }),
    );
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("staff must choose a recipient, and a blocked recipient is refused", async () => {
    mockAuthorize.mockResolvedValue(session(STAFF, STAFF_PERMS));

    const noRecipient = await sendMessageAction(undefined, formData({ subject: "Hi", body: "Hello" }));
    expect(noRecipient.success).toBe(false);

    prismaMock.user.findUnique.mockResolvedValue({ id: TARGET, status: "BLOCKED" });
    const blocked = await sendMessageAction(
      undefined,
      formData({ toUserId: TARGET, subject: "Hi", body: "Hello" }),
    );
    expect(blocked.success).toBe(false);
    expect(messageRepo.createMessage).not.toHaveBeenCalled();
  });

  it("staff message to a member is stored and notifies them", async () => {
    mockAuthorize.mockResolvedValue(session(STAFF, STAFF_PERMS));
    prismaMock.user.findUnique.mockResolvedValue({ id: TARGET, status: "ACTIVE" });
    messageRepo.createMessage.mockResolvedValue({ id: "m2" });

    const result = await sendMessageAction(
      undefined,
      formData({ toUserId: TARGET, subject: "Welcome", body: "Glad to have you" }),
    );

    expect(result.success).toBe(true);
    expect(messageRepo.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({ toUserId: TARGET, toStaff: false }),
    );
    expect(mockCreateNotification).toHaveBeenCalledWith(expect.objectContaining({ userId: TARGET }));
  });

  it("is denied without message:send", async () => {
    mockAuthorize.mockRejectedValue(new AuthorizationError("no"));
    const result = await sendMessageAction(undefined, formData({ subject: "Hi", body: "Hello" }));
    expect(result.success).toBe(false);
    expect(messageRepo.createMessage).not.toHaveBeenCalled();
  });
});

describe("markMessageReadAction", () => {
  it("only the recipient (or staff, for team mail) can mark a message read", async () => {
    mockGetAuthSession.mockResolvedValue(session(OTHER, MEMBER_PERMS));
    messageRepo.getMessage.mockResolvedValue({ id: "m1", toUserId: TARGET, toStaff: false });

    const result = await markMessageReadAction(undefined, formData({ messageId: "m1" }));

    expect(result.success).toBe(false);
    expect(messageRepo.markMessageRead).not.toHaveBeenCalled();
  });
});

describe("moderateMemberAction", () => {
  const block = (extra: Record<string, string> = {}) =>
    formData({ userId: TARGET, action: "BLOCK", reason: "Chargeback abuse", ...extra });

  it("requires member:block (denied otherwise)", async () => {
    mockAuthorize.mockRejectedValue(new AuthorizationError("no"));
    const result = await moderateMemberAction(undefined, block());
    expect(result.success).toBe(false);
    expect(memberAdminRepo.setUserStatus).not.toHaveBeenCalled();
  });

  it("requires a reason", async () => {
    mockAuthorize.mockResolvedValue(session(STAFF, STAFF_PERMS));
    const result = await moderateMemberAction(undefined, block({ reason: "" }));
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("VALIDATION_ERROR");
  });

  it("refuses to block yourself", async () => {
    mockAuthorize.mockResolvedValue(session(TARGET, STAFF_PERMS));
    const result = await moderateMemberAction(undefined, block());
    expect(result.success).toBe(false);
    expect(memberAdminRepo.setUserStatus).not.toHaveBeenCalled();
  });

  it("refuses to block a staff account", async () => {
    mockAuthorize.mockResolvedValue(session(STAFF, STAFF_PERMS));
    memberAdminRepo.isStaffAccount.mockResolvedValue(true);
    const result = await moderateMemberAction(undefined, block());
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("FORBIDDEN");
  });

  it("blocks a member and writes an audit entry carrying the reason", async () => {
    mockAuthorize.mockResolvedValue(session(STAFF, STAFF_PERMS));
    prismaMock.user.findUnique.mockResolvedValue({
      status: "ACTIVE",
      emailVerifiedAt: new Date(),
      memberProfile: { id: "mp1" },
    });

    const result = await moderateMemberAction(undefined, block());

    expect(result.success).toBe(true);
    expect(memberAdminRepo.setUserStatus).toHaveBeenCalledWith(TARGET, "BLOCKED");
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "MEMBER_BLOCKED", after: expect.objectContaining({ reason: "Chargeback abuse" }) }),
    );
  });

  it("unblocking an unverified account restores PENDING_VERIFICATION, not ACTIVE", async () => {
    mockAuthorize.mockResolvedValue(session(STAFF, STAFF_PERMS));
    prismaMock.user.findUnique.mockResolvedValue({
      status: "BLOCKED",
      emailVerifiedAt: null,
      memberProfile: { id: "mp1" },
    });

    const result = await moderateMemberAction(undefined, block({ action: "UNBLOCK" }));

    expect(result.success).toBe(true);
    expect(memberAdminRepo.setUserStatus).toHaveBeenCalledWith(TARGET, "PENDING_VERIFICATION");
  });

  it("reports a conflict when the member is already blocked", async () => {
    mockAuthorize.mockResolvedValue(session(STAFF, STAFF_PERMS));
    prismaMock.user.findUnique.mockResolvedValue({
      status: "BLOCKED",
      emailVerifiedAt: new Date(),
      memberProfile: { id: "mp1" },
    });
    memberAdminRepo.setUserStatus.mockResolvedValue(false);

    const result = await moderateMemberAction(undefined, block());

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("CONFLICT");
  });
});
