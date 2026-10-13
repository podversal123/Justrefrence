import { describe, expect, it, vi, beforeEach } from "vitest";
import { Prisma } from "@/generated/prisma/client";

/**
 * The approval rules for an Admin's edits, with Prisma, the record handlers, notifications and audit
 * mocked at the module boundary (same convention as the other integration tests). They pin what
 * matters: a Super Admin's edit applies at once and creates no request; an Admin's edit leaves the
 * record untouched and files one request; only one request can wait per record; nobody decides on
 * their own request; approving applies the change atomically and is refused if the record moved on.
 */

const mockRecordAudit = vi.fn();
vi.mock("@/server/domain/audit/record", () => ({ recordAudit: mockRecordAudit }));

const mockCreateNotification = vi.fn().mockResolvedValue(undefined);
vi.mock("@/server/repositories/identity/notification-repository", () => ({
  createNotification: mockCreateNotification,
}));

const handler = {
  fields: [
    { key: "fullName", label: "Full name" },
    { key: "telephone", label: "Telephone" },
  ],
  load: vi.fn(),
  display: vi.fn(async (raw: Record<string, string | null>) => raw),
  apply: vi.fn().mockResolvedValue(undefined),
};
vi.mock("@/server/domain/approvals/handlers", () => ({
  getChangeHandler: () => handler,
  ENTITY_LABELS: { MEMBER_PROFILE: "Member profile" },
}));

const tx = { changeRequest: { updateMany: vi.fn() } };
const prismaMock = {
  user: { findMany: vi.fn() },
  changeRequest: { create: vi.fn(), findUnique: vi.fn(), updateMany: vi.fn() },
  $transaction: vi.fn(async (arg: unknown) =>
    typeof arg === "function" ? (arg as (t: typeof tx) => unknown)(tx) : arg,
  ),
};
vi.mock("@/server/lib/prisma", () => ({ prisma: prismaMock }));

const { submitChange, reviewChange } = await import("@/server/domain/approvals/change-service");

const MEMBER = "22222222-2222-4222-8222-222222222222";
const ADMIN = "33333333-3333-4333-8333-333333333333";
const SUPER = "44444444-4444-4444-8444-444444444444";
const REQUEST = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  handler.load.mockResolvedValue({
    label: "Asha Rao",
    raw: { fullName: "Asha Rao", telephone: null },
  });
  handler.display.mockImplementation(async (raw: Record<string, string | null>) => raw);
  tx.changeRequest.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.user.findMany.mockResolvedValue([{ id: SUPER }]);
  prismaMock.$transaction.mockImplementation(async (arg: unknown) =>
    typeof arg === "function" ? (arg as (t: typeof tx) => unknown)(tx) : arg,
  );
});

const edit = (overrides: Record<string, unknown> = {}) => ({
  entityType: "MEMBER_PROFILE" as const,
  entityId: MEMBER,
  proposed: { fullName: "Asha Rao", telephone: "011-23456789" },
  actorId: ADMIN,
  canApplyDirect: false,
  ...overrides,
});

describe("submitChange", () => {
  it("applies a Super Admin's edit at once and files no request", async () => {
    const result = await submitChange(edit({ actorId: SUPER, canApplyDirect: true }));

    expect(result).toEqual({ mode: "APPLIED" });
    expect(handler.apply).toHaveBeenCalledWith(tx, MEMBER, { telephone: "011-23456789" });
    expect(prismaMock.changeRequest.create).not.toHaveBeenCalled();
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CHANGE_APPLIED" }),
    );
  });

  it("files a request for an Admin's edit and leaves the record untouched", async () => {
    prismaMock.changeRequest.create.mockResolvedValue({ id: REQUEST });

    const result = await submitChange(edit({ note: "Member called to correct it" }));

    expect(result).toEqual({ mode: "SUBMITTED", requestId: REQUEST });
    expect(handler.apply).not.toHaveBeenCalled();
    expect(prismaMock.changeRequest.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: "MEMBER_PROFILE",
          entityId: MEMBER,
          entityLabel: "Asha Rao",
          pendingKey: `MEMBER_PROFILE:${MEMBER}`,
          requestedBy: ADMIN,
          requestNote: "Member called to correct it",
          proposed: { telephone: "011-23456789" },
          diff: [{ field: "telephone", label: "Telephone", from: null, to: "011-23456789" }],
        }),
      }),
    );
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CHANGE_REQUESTED" }),
    );
  });

  it("tells the Super Admins about it, but not the person who asked", async () => {
    prismaMock.changeRequest.create.mockResolvedValue({ id: REQUEST });
    await submitChange(edit());
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: SUPER, type: "CHANGE_REQUESTED" }),
    );

    mockCreateNotification.mockClear();
    prismaMock.user.findMany.mockResolvedValue([{ id: ADMIN }]);
    await submitChange(edit());
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("refuses an edit that changes nothing", async () => {
    await expect(
      submitChange(edit({ proposed: { fullName: "Asha Rao", telephone: "" } })),
    ).rejects.toThrow(/did not change anything/i);
    expect(prismaMock.changeRequest.create).not.toHaveBeenCalled();
  });

  it("allows only one pending request per record", async () => {
    prismaMock.changeRequest.create.mockRejectedValue(
      new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
      }),
    );
    await expect(submitChange(edit())).rejects.toThrow(/already waiting for approval/i);
  });

  it("says so when the record does not exist", async () => {
    handler.load.mockResolvedValue(null);
    await expect(submitChange(edit())).rejects.toThrow(/not found/i);
  });
});

function pendingRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: REQUEST,
    entityType: "MEMBER_PROFILE",
    entityId: MEMBER,
    entityLabel: "Asha Rao",
    status: "PENDING",
    requestedBy: ADMIN,
    diff: [{ field: "telephone", label: "Telephone", from: null, to: "011-23456789" }],
    proposed: { telephone: "011-23456789" },
    ...overrides,
  };
}

describe("reviewChange", () => {
  it("applies the change and marks it approved in one transaction, then tells the admin", async () => {
    prismaMock.changeRequest.findUnique.mockResolvedValue(pendingRequest());

    await reviewChange({ requestId: REQUEST, reviewerId: SUPER, decision: "APPROVE" });

    expect(tx.changeRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: REQUEST, status: "PENDING" },
        data: expect.objectContaining({ status: "APPROVED", reviewedBy: SUPER, pendingKey: null }),
      }),
    );
    expect(handler.apply).toHaveBeenCalledWith(tx, MEMBER, { telephone: "011-23456789" });
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: ADMIN, type: "CHANGE_APPROVED" }),
    );
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "CHANGE_APPROVED" }),
    );
  });

  it("rejects without touching the record, and passes the reason on", async () => {
    prismaMock.changeRequest.findUnique.mockResolvedValue(pendingRequest());
    prismaMock.changeRequest.updateMany.mockResolvedValue({ count: 1 });

    await reviewChange({
      requestId: REQUEST,
      reviewerId: SUPER,
      decision: "REJECT",
      note: "Number is wrong",
    });

    expect(handler.apply).not.toHaveBeenCalled();
    expect(prismaMock.changeRequest.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "REJECTED", reviewNote: "Number is wrong" }),
      }),
    );
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "CHANGE_REJECTED",
        payload: expect.objectContaining({ note: "Number is wrong" }),
      }),
    );
  });

  it("does not let anyone decide on their own request", async () => {
    prismaMock.changeRequest.findUnique.mockResolvedValue(pendingRequest());
    await expect(
      reviewChange({ requestId: REQUEST, reviewerId: ADMIN, decision: "APPROVE" }),
    ).rejects.toThrow(/your own request/i);
    expect(handler.apply).not.toHaveBeenCalled();
  });

  it("refuses a request that was already decided", async () => {
    prismaMock.changeRequest.findUnique.mockResolvedValue(pendingRequest({ status: "APPROVED" }));
    await expect(
      reviewChange({ requestId: REQUEST, reviewerId: SUPER, decision: "APPROVE" }),
    ).rejects.toThrow(/already been decided/i);
  });

  it("refuses to approve when someone changed the field after the request was made", async () => {
    prismaMock.changeRequest.findUnique.mockResolvedValue(pendingRequest());
    handler.load.mockResolvedValue({
      label: "Asha Rao",
      raw: { fullName: "Asha Rao", telephone: "9999999999" },
    });

    await expect(
      reviewChange({ requestId: REQUEST, reviewerId: SUPER, decision: "APPROVE" }),
    ).rejects.toThrow(/Telephone changed after this request/);
    expect(handler.apply).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it("is not blocked by an unrelated field changing meanwhile", async () => {
    prismaMock.changeRequest.findUnique.mockResolvedValue(pendingRequest());
    handler.load.mockResolvedValue({
      label: "Asha Rao",
      raw: { fullName: "Asha R. Rao", telephone: null },
    });

    await expect(
      reviewChange({ requestId: REQUEST, reviewerId: SUPER, decision: "APPROVE" }),
    ).resolves.toBeUndefined();
    expect(handler.apply).toHaveBeenCalled();
  });

  it("loses the race gracefully when two reviewers act at once", async () => {
    prismaMock.changeRequest.findUnique.mockResolvedValue(pendingRequest());
    tx.changeRequest.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      reviewChange({ requestId: REQUEST, reviewerId: SUPER, decision: "APPROVE" }),
    ).rejects.toThrow(/already been decided/i);
    expect(handler.apply).not.toHaveBeenCalled();
  });

  it("still completes if the notification cannot be sent", async () => {
    prismaMock.changeRequest.findUnique.mockResolvedValue(pendingRequest());
    mockCreateNotification.mockRejectedValueOnce(new Error("db down"));

    await expect(
      reviewChange({ requestId: REQUEST, reviewerId: SUPER, decision: "APPROVE" }),
    ).resolves.toBeUndefined();
  });
});
