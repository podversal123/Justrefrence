import { msg } from "@/i18n/locales";
import type { KycDocumentStatus, KycDocumentType } from "@/generated/prisma/enums";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/upload-limits";

/**
 * Pure KYC rules (no I/O): what a valid upload is, which documents a person can submit, and how a
 * reviewed document turns into the member's overall KYC status.
 */

export type KycFileKind = "pdf" | "jpeg" | "png" | "webp";

export const KYC_FILE_KINDS: Record<KycFileKind, { contentType: string; extension: string }> = {
  pdf: { contentType: "application/pdf", extension: "pdf" },
  jpeg: { contentType: "image/jpeg", extension: "jpg" },
  png: { contentType: "image/png", extension: "png" },
  webp: { contentType: "image/webp", extension: "webp" },
};

export const KYC_ACCEPTED_LABEL = `PDF, JPEG, PNG or WebP, up to ${MAX_UPLOAD_LABEL}`;

/** What the file really is, read from its first bytes. The browser-supplied type is never trusted. */
export function detectFileKind(bytes: Uint8Array): KycFileKind | null {
  const startsWith = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (startsWith(0x25, 0x50, 0x44, 0x46, 0x2d)) return "pdf"; // %PDF-
  if (startsWith(0xff, 0xd8, 0xff)) return "jpeg";
  if (startsWith(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)) return "png";
  // WebP: "RIFF" + 4 size bytes + "WEBP"
  if (
    startsWith(0x52, 0x49, 0x46, 0x46) &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

export type UploadCheck = { ok: true; kind: KycFileKind } | { ok: false; message: string };

export function checkUpload(input: {
  size: number;
  declaredType: string;
  bytes: Uint8Array;
}): UploadCheck {
  if (input.size === 0) return { ok: false, message: "That file is empty." };
  if (input.size > MAX_UPLOAD_BYTES) {
    return { ok: false, message: `The file is too large. Use one up to ${MAX_UPLOAD_LABEL}.` };
  }
  const kind = detectFileKind(input.bytes);
  if (!kind) return { ok: false, message: `Upload a ${KYC_ACCEPTED_LABEL}.` };
  if (KYC_FILE_KINDS[kind].contentType !== input.declaredType) {
    return { ok: false, message: "The file's contents don't match its type. Pick it again." };
  }
  return { ok: true, kind };
}

export const DOCUMENT_LABELS: Record<KycDocumentType, string> = {
  PAN_CARD: msg("PAN card"),
  GST_CERTIFICATE: msg("GST certificate"),
};

/** Everyone can submit a PAN card; the GST certificate is for vendors. */
export function allowedDocumentTypes(owner: { isVendor: boolean }): KycDocumentType[] {
  return owner.isVendor ? ["PAN_CARD", "GST_CERTIFICATE"] : ["PAN_CARD"];
}

export type MemberKycStatus = "PENDING" | "VERIFIED" | "REJECTED";

/** A member counts as KYC-verified when their PAN card has been verified; nothing else changes that. */
export function memberKycStatusFrom(panStatus: KycDocumentStatus | null): MemberKycStatus {
  if (panStatus === "VERIFIED") return "VERIFIED";
  if (panStatus === "REJECTED") return "REJECTED";
  return "PENDING";
}

/** Nobody reviews their own document, even with the permission. */
export function canReviewDocument(input: { reviewerId: string; ownerId: string }): boolean {
  return input.reviewerId !== input.ownerId;
}

export const KYC_NOTIFICATION_TYPES = {
  VERIFIED: "KYC_VERIFIED",
  REJECTED: "KYC_REJECTED",
} as const;
