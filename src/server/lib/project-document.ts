import "server-only";
import { randomUUID } from "node:crypto";
import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/upload-limits";
import { ValidationError } from "@/server/lib/errors";
import { removeKycFile, uploadKycFile } from "@/server/lib/kyc-storage";

/**
 * The one document a seller can attach to a project (a brief, a drawing, a quotation). It may carry
 * commercial terms, so it lives in the same private bucket as KYC documents and is only ever opened
 * through a checked, short-lived link (src/app/api/catalog/project-doc/[id]/route.ts). See
 * docs/file-upload.md: "Project document".
 *
 * The file is judged by what is inside it, not by its name: the first bytes must match the type the
 * extension claims, so a program renamed to .pdf is refused.
 */

const TYPES: Record<string, { contentType: string; matches: (head: Buffer) => boolean }> = {
  pdf: { contentType: "application/pdf", matches: (h) => h.subarray(0, 5).toString() === "%PDF-" },
  png: {
    contentType: "image/png",
    matches: (h) =>
      h.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  jpg: {
    contentType: "image/jpeg",
    matches: (h) => h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff,
  },
  jpeg: {
    contentType: "image/jpeg",
    matches: (h) => h[0] === 0xff && h[1] === 0xd8 && h[2] === 0xff,
  },
  // Office files are zip containers.
  docx: {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    matches: (h) => h[0] === 0x50 && h[1] === 0x4b && h[2] === 0x03 && h[3] === 0x04,
  },
  xlsx: {
    contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    matches: (h) => h[0] === 0x50 && h[1] === 0x4b && h[2] === 0x03 && h[3] === 0x04,
  },
};

export const PROJECT_DOCUMENT_ACCEPT = ".pdf,.png,.jpg,.jpeg,.docx,.xlsx";

export interface StoredProjectDocument {
  storagePath: string;
  fileName: string;
}

/** True when the form carried a file (an empty file input still sends an empty File). */
export function hasProjectDocument(value: FormDataEntryValue | null): value is File {
  return value instanceof File && value.size > 0;
}

export async function storeProjectDocument(
  vendorId: string,
  file: File,
): Promise<StoredProjectDocument> {
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new ValidationError(`The document is too large. The limit is ${MAX_UPLOAD_LABEL}.`);
  }
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  const type = TYPES[extension];
  if (!type) {
    throw new ValidationError("Attach a PDF, Word, Excel, PNG or JPG file.");
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  if (!type.matches(bytes)) {
    throw new ValidationError("That file is not the kind of document its name says.");
  }
  // The name the seller gave is only kept for display; the stored path is generated.
  const storagePath = `project-docs/${vendorId}/${randomUUID()}.${extension}`;
  await uploadKycFile(storagePath, bytes, type.contentType);
  return { storagePath, fileName: file.name.slice(0, 200) };
}

/** Best effort: an orphaned file in a private bucket is harmless, so a failure is not raised. */
export async function removeProjectDocument(storagePath: string | null | undefined): Promise<void> {
  if (!storagePath) return;
  await removeKycFile(storagePath).catch(() => undefined);
}
