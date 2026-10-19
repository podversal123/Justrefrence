import { MAX_UPLOAD_BYTES, MAX_UPLOAD_LABEL } from "@/lib/upload-limits";

/**
 * Pure rules for a résumé uploaded through the public Careers form (no I/O): which files are accepted,
 * how a file's real type is read from its first bytes, and how a sender's file name is cleaned before it
 * is shown to staff. The type the browser claims is never trusted, and the name the sender gave is never
 * used as a storage path.
 */

export type ResumeFileKind = "pdf" | "doc" | "docx";

export const RESUME_FILE_KINDS: Record<ResumeFileKind, { contentType: string; extension: string }> =
  {
    pdf: { contentType: "application/pdf", extension: "pdf" },
    doc: { contentType: "application/msword", extension: "doc" },
    docx: {
      contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      extension: "docx",
    },
  };

export const RESUME_ACCEPTED_LABEL = `PDF, DOC or DOCX, up to ${MAX_UPLOAD_LABEL}`;

/** What the file really is. A DOCX is a ZIP that holds a `word/` folder; a plain ZIP is not accepted. */
export function detectResumeKind(bytes: Uint8Array): ResumeFileKind | null {
  const startsWith = (...sig: number[]) => sig.every((b, i) => bytes[i] === b);
  if (startsWith(0x25, 0x50, 0x44, 0x46, 0x2d)) return "pdf"; // %PDF-
  if (startsWith(0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1)) return "doc"; // old Word (OLE2)
  if (startsWith(0x50, 0x4b, 0x03, 0x04)) {
    // The names of a ZIP's entries are stored as plain text, so a Word document names "word/..." entries.
    return Buffer.from(bytes).includes("word/") ? "docx" : null;
  }
  return null;
}

export type ResumeCheck =
  | { ok: true; kind: ResumeFileKind; extension: string; contentType: string }
  | { ok: false; message: string };

export function checkResumeUpload(input: {
  size: number;
  fileName: string;
  bytes: Uint8Array;
}): ResumeCheck {
  if (input.size === 0) return { ok: false, message: "That file is empty." };
  if (input.size > MAX_UPLOAD_BYTES) {
    return { ok: false, message: `The file is too large. Use one up to ${MAX_UPLOAD_LABEL}.` };
  }
  const kind = detectResumeKind(input.bytes);
  if (!kind) return { ok: false, message: `Upload a ${RESUME_ACCEPTED_LABEL}.` };
  const extension = input.fileName.toLowerCase().split(".").pop() ?? "";
  if (extension !== RESUME_FILE_KINDS[kind].extension) {
    return { ok: false, message: "The file's contents don't match its name. Pick it again." };
  }
  const { contentType } = RESUME_FILE_KINDS[kind];
  return { ok: true, kind, extension, contentType };
}

/** A name that is safe to show: no folders, no control characters, bounded length. Display only. */
export function cleanFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").trim();
  return cleaned.slice(0, 120) || "resume";
}
