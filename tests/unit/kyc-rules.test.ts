import { describe, expect, it } from "vitest";
import {
  allowedDocumentTypes,
  canReviewDocument,
  checkUpload,
  detectFileKind,
  memberKycStatusFrom,
} from "@/server/domain/kyc/rules";
import { MAX_UPLOAD_BYTES } from "@/lib/upload-limits";

const bytes = (...b: number[]) => Uint8Array.from([...b, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
const PDF = bytes(0x25, 0x50, 0x44, 0x46, 0x2d);
const JPEG = bytes(0xff, 0xd8, 0xff, 0xe0);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
const WEBP = Uint8Array.from([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50, 0]);

describe("detectFileKind", () => {
  it("recognises each accepted format from its first bytes", () => {
    expect(detectFileKind(PDF)).toBe("pdf");
    expect(detectFileKind(JPEG)).toBe("jpeg");
    expect(detectFileKind(PNG)).toBe("png");
    expect(detectFileKind(WEBP)).toBe("webp");
  });

  it("rejects anything else, including scripts, executables and truncated files", () => {
    expect(detectFileKind(new TextEncoder().encode("<script>alert(1)</script>"))).toBeNull();
    expect(detectFileKind(bytes(0x4d, 0x5a))).toBeNull(); // Windows executable
    expect(detectFileKind(new Uint8Array(0))).toBeNull();
    expect(
      detectFileKind(Uint8Array.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45])),
    ).toBeNull(); // WAV
  });
});

describe("checkUpload", () => {
  it("accepts a file whose contents match its declared type", () => {
    expect(checkUpload({ size: 1000, declaredType: "application/pdf", bytes: PDF })).toEqual({
      ok: true,
      kind: "pdf",
    });
    expect(checkUpload({ size: 1000, declaredType: "image/png", bytes: PNG })).toEqual({
      ok: true,
      kind: "png",
    });
  });

  it("refuses an empty file and one over the size limit", () => {
    expect(checkUpload({ size: 0, declaredType: "application/pdf", bytes: PDF }).ok).toBe(false);
    expect(
      checkUpload({ size: MAX_UPLOAD_BYTES + 1, declaredType: "application/pdf", bytes: PDF }).ok,
    ).toBe(false);
    expect(
      checkUpload({ size: MAX_UPLOAD_BYTES, declaredType: "application/pdf", bytes: PDF }).ok,
    ).toBe(true);
  });

  it("refuses a file that lies about its type (a script renamed to .pdf, an image labelled as PDF)", () => {
    const script = new TextEncoder().encode("#!/bin/sh\nrm -rf /");
    expect(checkUpload({ size: 20, declaredType: "application/pdf", bytes: script }).ok).toBe(
      false,
    );
    expect(checkUpload({ size: 1000, declaredType: "application/pdf", bytes: JPEG }).ok).toBe(
      false,
    );
  });
});

describe("document rules", () => {
  it("lets everyone submit a PAN card, and corporate (vendor) accounts also an incorporation and an optional GST certificate", () => {
    expect(allowedDocumentTypes({ isVendor: false })).toEqual(["PAN_CARD"]);
    expect(allowedDocumentTypes({ isVendor: true })).toEqual([
      "PAN_CARD",
      "INCORPORATION_CERTIFICATE",
      "GST_CERTIFICATE",
    ]);
  });

  it("derives the member's KYC status from the PAN card alone", () => {
    expect(memberKycStatusFrom(null)).toBe("PENDING");
    expect(memberKycStatusFrom("PENDING")).toBe("PENDING");
    expect(memberKycStatusFrom("VERIFIED")).toBe("VERIFIED");
    expect(memberKycStatusFrom("REJECTED")).toBe("REJECTED");
  });

  it("does not let anyone review their own document", () => {
    expect(canReviewDocument({ reviewerId: "a", ownerId: "a" })).toBe(false);
    expect(canReviewDocument({ reviewerId: "a", ownerId: "b" })).toBe(true);
  });
});
