import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The KYC review and submit rules, with Prisma, storage, notifications and audit mocked at the
 * module boundary (same convention as the other integration tests). They pin what matters:
 * nobody reviews their own document, a PAN card needs a PAN number on file before it can be
 * verified, a document is reviewed once, the member's KYC status follows the PAN card, and the
 * person is told the outcome.
 */

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const mockRecordAudit = vi.fn();
vi.mock("@/server/domain/audit/record", () => ({ recordAudit: mockRecordAudit }));

const mockCreateNotification = vi.fn().mockResolvedValue(undefined);
vi.mock("@/server/repositories/identity/notification-repository", () => ({
  createNotification: mockCreateNotification,
}));

const mockUpload = vi.fn().mockResolvedValue(undefined);
const mockRemove = vi.fn().mockResolvedValue(undefined);
vi.mock("@/server/lib/kyc-storage", () => ({
  uploadKycFile: mockUpload,
  removeKycFile: mockRemove,
}));

vi.mock("@/server/lib/rate-limit", () => ({
  contentRateLimiter: { consume: vi.fn(async () => ({ allowed: true, remaining: 5, resetAt: 0 })) },
}));

const tx = {
  kycDocument: { updateMany: vi.fn(), upsert: vi.fn() },
  memberProfile: { update: vi.fn(), updateMany: vi.fn() },
};
const prismaMock = {
  kycDocument: { findUnique: vi.fn() },
  $transaction: vi.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
};
vi.mock("@/server/lib/prisma", () => ({ prisma: prismaMock }));

const { reviewKycDocument, submitKycDocument } = await import("@/server/domain/kyc/kyc-service");

const OWNER = "22222222-2222-4222-8222-222222222222";
const REVIEWER = "44444444-4444-4444-8444-444444444444";
const DOC = "11111111-1111-4111-8111-111111111111";

function pendingDoc(overrides: Record<string, unknown> = {}) {
  return {
    id: DOC,
    ownerUserId: OWNER,
    type: "PAN_CARD",
    status: "PENDING",
    owner: {
      id: OWNER,
      memberProfile: { id: "member-1", pan: "ABCDE1234F" },
      vendorProfile: null,
    },
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  tx.kycDocument.updateMany.mockResolvedValue({ count: 1 });
  prismaMock.$transaction.mockImplementation(async (fn: (t: typeof tx) => unknown) => fn(tx));
});

describe("reviewKycDocument", () => {
  it("lets a reviewer verify a pending PAN card and marks the member's KYC as verified", async () => {
    prismaMock.kycDocument.findUnique.mockResolvedValue(pendingDoc());

    await reviewKycDocument({ documentId: DOC, reviewerId: REVIEWER, decision: "VERIFY" });

    expect(tx.kycDocument.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: DOC, status: "PENDING" },
        data: expect.objectContaining({ status: "VERIFIED", reviewedBy: REVIEWER }),
      }),
    );
    expect(tx.memberProfile.update).toHaveBeenCalledWith({
      where: { id: "member-1" },
      data: { kycStatus: "VERIFIED" },
    });
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({ userId: OWNER, type: "KYC_VERIFIED" }),
    );
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "KYC_DOCUMENT_VERIFIED", actorId: REVIEWER }),
    );
  });

  it("rejects with the reason, tells the person, and marks the member's KYC as rejected", async () => {
    prismaMock.kycDocument.findUnique.mockResolvedValue(pendingDoc());

    await reviewKycDocument({
      documentId: DOC,
      reviewerId: REVIEWER,
      decision: "REJECT",
      reason: "Photo is blurry",
    });

    expect(tx.kycDocument.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "REJECTED", rejectedReason: "Photo is blurry" }),
      }),
    );
    expect(tx.memberProfile.update).toHaveBeenCalledWith({
      where: { id: "member-1" },
      data: { kycStatus: "REJECTED" },
    });
    expect(mockCreateNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "KYC_REJECTED",
        payload: expect.objectContaining({ reason: "Photo is blurry" }),
      }),
    );
  });

  it("does not let anyone review their own document", async () => {
    prismaMock.kycDocument.findUnique.mockResolvedValue(pendingDoc());

    await expect(
      reviewKycDocument({ documentId: DOC, reviewerId: OWNER, decision: "VERIFY" }),
    ).rejects.toThrow(/your own document/i);
    expect(tx.kycDocument.updateMany).not.toHaveBeenCalled();
  });

  it("will not verify a PAN card when no PAN number is on file to check it against", async () => {
    prismaMock.kycDocument.findUnique.mockResolvedValue(
      pendingDoc({
        owner: { id: OWNER, memberProfile: { id: "member-1", pan: null }, vendorProfile: null },
      }),
    );

    await expect(
      reviewKycDocument({ documentId: DOC, reviewerId: REVIEWER, decision: "VERIFY" }),
    ).rejects.toThrow(/PAN number on file/i);
    expect(tx.kycDocument.updateMany).not.toHaveBeenCalled();
  });

  it("refuses a document that was already reviewed", async () => {
    prismaMock.kycDocument.findUnique.mockResolvedValue(pendingDoc({ status: "VERIFIED" }));

    await expect(
      reviewKycDocument({ documentId: DOC, reviewerId: REVIEWER, decision: "VERIFY" }),
    ).rejects.toThrow(/already been reviewed/i);
  });

  it("loses the race gracefully when a second reviewer got there first", async () => {
    prismaMock.kycDocument.findUnique.mockResolvedValue(pendingDoc());
    tx.kycDocument.updateMany.mockResolvedValue({ count: 0 });

    await expect(
      reviewKycDocument({ documentId: DOC, reviewerId: REVIEWER, decision: "VERIFY" }),
    ).rejects.toThrow(/already been reviewed/i);
    expect(tx.memberProfile.update).not.toHaveBeenCalled();
    expect(mockCreateNotification).not.toHaveBeenCalled();
  });

  it("does not touch the member's KYC status for a GST certificate", async () => {
    prismaMock.kycDocument.findUnique.mockResolvedValue(
      pendingDoc({
        type: "GST_CERTIFICATE",
        owner: {
          id: OWNER,
          memberProfile: { id: "member-1", pan: null },
          vendorProfile: { pan: null },
        },
      }),
    );

    await reviewKycDocument({ documentId: DOC, reviewerId: REVIEWER, decision: "VERIFY" });

    expect(tx.kycDocument.updateMany).toHaveBeenCalled();
    expect(tx.memberProfile.update).not.toHaveBeenCalled();
  });

  it("still completes the review if the notification cannot be sent", async () => {
    prismaMock.kycDocument.findUnique.mockResolvedValue(pendingDoc());
    mockCreateNotification.mockRejectedValueOnce(new Error("db down"));

    await expect(
      reviewKycDocument({ documentId: DOC, reviewerId: REVIEWER, decision: "VERIFY" }),
    ).resolves.toBeUndefined();
    expect(mockRecordAudit).toHaveBeenCalled();
  });
});

describe("submitKycDocument", () => {
  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  const pdfFile = (name = "pan.pdf") => new File([pdfBytes], name, { type: "application/pdf" });

  it("stores a valid PDF privately, sends the document to review and resets the member's KYC", async () => {
    prismaMock.kycDocument.findUnique.mockResolvedValue(null);
    tx.kycDocument.upsert.mockResolvedValue({ id: DOC });

    await submitKycDocument({
      ownerUserId: OWNER,
      isVendor: false,
      type: "PAN_CARD",
      file: pdfFile(),
    });

    expect(mockUpload).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^${OWNER}/pan_card/.+\\.pdf$`)),
      expect.any(Buffer),
      "application/pdf",
    );
    expect(tx.memberProfile.updateMany).toHaveBeenCalledWith({
      where: { userId: OWNER },
      data: { kycStatus: "PENDING" },
    });
    expect(mockRecordAudit).toHaveBeenCalledWith(
      expect.objectContaining({ action: "KYC_DOCUMENT_SUBMITTED" }),
    );
  });

  it("replaces an earlier upload and removes the old file", async () => {
    prismaMock.kycDocument.findUnique.mockResolvedValue({ storagePath: "old/path.pdf" });
    tx.kycDocument.upsert.mockResolvedValue({ id: DOC });

    await submitKycDocument({
      ownerUserId: OWNER,
      isVendor: false,
      type: "PAN_CARD",
      file: pdfFile(),
    });

    expect(mockRemove).toHaveBeenCalledWith("old/path.pdf");
  });

  it("rejects a file that is not what it claims to be, before anything is stored", async () => {
    const fake = new File([new TextEncoder().encode("<script>alert(1)</script>")], "pan.pdf", {
      type: "application/pdf",
    });

    await expect(
      submitKycDocument({ ownerUserId: OWNER, isVendor: false, type: "PAN_CARD", file: fake }),
    ).rejects.toThrow();
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("only lets vendors submit a GST certificate", async () => {
    await expect(
      submitKycDocument({
        ownerUserId: OWNER,
        isVendor: false,
        type: "GST_CERTIFICATE",
        file: pdfFile(),
      }),
    ).rejects.toThrow(/not needed/i);
    expect(mockUpload).not.toHaveBeenCalled();
  });

  it("removes the stored file if saving to the database fails", async () => {
    prismaMock.kycDocument.findUnique.mockResolvedValue(null);
    prismaMock.$transaction.mockRejectedValueOnce(new Error("db down"));

    await expect(
      submitKycDocument({ ownerUserId: OWNER, isVendor: false, type: "PAN_CARD", file: pdfFile() }),
    ).rejects.toThrow("db down");
    expect(mockRemove).toHaveBeenCalledTimes(1);
  });
});
