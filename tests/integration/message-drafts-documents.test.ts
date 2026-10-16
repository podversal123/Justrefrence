import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AuthSession } from "@/server/auth/session";
import type { Permission } from "@/server/auth/permissions";

/**
 * Messages to the team with a document, and saved drafts, with storage, the database and the session
 * replaced by fakes. What matters: a document goes to the team only, it is checked from its real bytes,
 * a stored file is cleaned up if saving the message fails, and a draft can only be touched by its author.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const mockRecordAudit = vi.fn();
vi.mock("@/server/domain/audit/record", () => ({ recordAudit: mockRecordAudit }));

const mockAuthorize = vi.fn();
vi.mock("@/server/auth/authorize", () => ({ authorize: mockAuthorize }));
vi.mock("@/server/auth/session", () => ({ getAuthSession: vi.fn() }));

vi.mock("@/server/lib/rate-limit", () => ({
  contentRateLimiter: { consume: vi.fn(async () => ({ allowed: true })) },
}));
vi.mock("@/server/repositories/identity/notification-repository", () => ({
  createNotification: vi.fn().mockResolvedValue(undefined),
}));

const repo = {
  createMessage: vi.fn(),
  getMessage: vi.fn(),
  markMessageRead: vi.fn(),
  saveDraft: vi.fn(),
  deleteDraft: vi.fn(),
};
vi.mock("@/server/repositories/support/message-repository", () => repo);

const storage = { uploadMessageDoc: vi.fn(), removeMessageDoc: vi.fn() };
vi.mock("@/server/lib/message-doc-storage", () => storage);

vi.mock("@/server/lib/prisma", () => ({ prisma: { user: { findUnique: vi.fn() } } }));

const { sendMessageAction, saveMessageDraftAction, deleteMessageDraftAction } =
  await import("@/server/services/message-actions");
const { getAuthSession } = await import("@/server/auth/session");

function session(staff: boolean): AuthSession {
  const permissions = new Set<Permission>(["message:send", "message:read"]);
  if (staff) permissions.add("member:read:any");
  return {
    userId: "user-1",
    email: "u@example.com",
    fullName: "U",
    status: "ACTIVE",
    roles: staff ? ["ADMIN"] : ["CUSTOMER"],
    permissions,
    hasVendorProfile: false,
    hasMemberProfile: true,
    vendorProfileId: null,
  };
}

function form(fields: Record<string, string | File>) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.set(key, value);
  return fd;
}

const pdf = () =>
  new File(
    [new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34, 0x0a])],
    "invoice.pdf",
    {
      type: "application/pdf",
    },
  );
const MESSAGE = { subject: "Documents for my account", body: "Please see the attached file." };
const DRAFT_ID = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthorize.mockResolvedValue(session(false));
  vi.mocked(getAuthSession).mockResolvedValue(session(false));
  repo.createMessage.mockResolvedValue({ id: "msg-1" });
  repo.saveDraft.mockResolvedValue(DRAFT_ID);
  repo.deleteDraft.mockResolvedValue(true);
  storage.uploadMessageDoc.mockResolvedValue(undefined);
  storage.removeMessageDoc.mockResolvedValue(undefined);
});

describe("sending a message with a document", () => {
  it("stores the file privately under the sender's own folder and saves it with the message", async () => {
    const result = await sendMessageAction(undefined, form({ ...MESSAGE, document: pdf() }));

    expect(result.success).toBe(true);
    const [path, , type] = storage.uploadMessageDoc.mock.calls[0]!;
    expect(path).toMatch(/^user-1\/[0-9a-f-]{36}\.pdf$/);
    expect(type).toBe("application/pdf");
    expect(repo.createMessage).toHaveBeenCalledWith(
      expect.objectContaining({ toStaff: true, toUserId: null }),
      expect.objectContaining({
        storagePath: path,
        fileName: "invoice.pdf",
        contentType: "application/pdf",
      }),
    );
  });

  it("refuses a file whose contents are not what its type says, and stores nothing", async () => {
    const fake = new File([new TextEncoder().encode("just text, not a pdf")], "evil.pdf", {
      type: "application/pdf",
    });
    const result = await sendMessageAction(undefined, form({ ...MESSAGE, document: fake }));

    expect(result.success).toBe(false);
    expect(storage.uploadMessageDoc).not.toHaveBeenCalled();
    expect(repo.createMessage).not.toHaveBeenCalled();
  });

  it("does not let staff attach a document, because documents go to the team only", async () => {
    mockAuthorize.mockResolvedValue(session(true));
    const result = await sendMessageAction(
      undefined,
      form({ ...MESSAGE, toUserId: "22222222-2222-4222-8222-222222222222", document: pdf() }),
    );
    expect(result.success).toBe(false);
    expect(storage.uploadMessageDoc).not.toHaveBeenCalled();
  });

  it("removes the stored file if saving the message fails, so nothing is left behind", async () => {
    repo.createMessage.mockRejectedValue(new Error("database down"));
    const result = await sendMessageAction(undefined, form({ ...MESSAGE, document: pdf() }));

    expect(result.success).toBe(false);
    const [stored] = storage.uploadMessageDoc.mock.calls[0]!;
    expect(storage.removeMessageDoc).toHaveBeenCalledWith(stored);
  });

  it("removes the draft that was sent, and only that person's draft", async () => {
    await sendMessageAction(undefined, form({ ...MESSAGE, draftId: DRAFT_ID }));
    expect(repo.deleteDraft).toHaveBeenCalledWith("user-1", DRAFT_ID);
  });

  it("works without a document, as before", async () => {
    const result = await sendMessageAction(undefined, form(MESSAGE));
    expect(result.success).toBe(true);
    expect(storage.uploadMessageDoc).not.toHaveBeenCalled();
    expect(repo.createMessage).toHaveBeenCalledWith(expect.anything(), undefined);
  });
});

describe("saving a draft", () => {
  it("saves the draft for the signed-in member", async () => {
    const result = await saveMessageDraftAction(undefined, form({ subject: "Hello", body: "" }));
    expect(result.success && result.data.draftId).toBe(DRAFT_ID);
    expect(repo.saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", subject: "Hello" }),
    );
  });

  it("refuses an empty draft", async () => {
    const result = await saveMessageDraftAction(undefined, form({ subject: "  ", body: "" }));
    expect(result.success).toBe(false);
    expect(repo.saveDraft).not.toHaveBeenCalled();
  });

  it("is not for staff, who pick a recipient every time", async () => {
    mockAuthorize.mockResolvedValue(session(true));
    const result = await saveMessageDraftAction(undefined, form({ subject: "Hi", body: "there" }));
    expect(result.success).toBe(false);
    expect(repo.saveDraft).not.toHaveBeenCalled();
  });

  it("says so when the draft to update is not this person's (the repository finds nothing)", async () => {
    repo.saveDraft.mockResolvedValue(null);
    const result = await saveMessageDraftAction(
      undefined,
      form({ draftId: DRAFT_ID, subject: "Hi", body: "there" }),
    );
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.code).toBe("NOT_FOUND");
  });
});

describe("deleting a draft", () => {
  it("deletes only the signed-in person's own draft", async () => {
    const result = await deleteMessageDraftAction(undefined, form({ draftId: DRAFT_ID }));
    expect(result.success).toBe(true);
    expect(repo.deleteDraft).toHaveBeenCalledWith("user-1", DRAFT_ID);
  });

  it("reports not found when it is not theirs or is already gone", async () => {
    repo.deleteDraft.mockResolvedValue(false);
    const result = await deleteMessageDraftAction(undefined, form({ draftId: DRAFT_ID }));
    expect(result.success).toBe(false);
  });

  it("ignores an id that is not an id, without touching the database", async () => {
    const result = await deleteMessageDraftAction(undefined, form({ draftId: "../../etc" }));
    expect(result.success).toBe(false);
    expect(repo.deleteDraft).not.toHaveBeenCalled();
  });
});
