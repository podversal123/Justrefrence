import { describe, expect, it } from "vitest";
import {
  checkResumeUpload,
  cleanFileName,
  detectResumeKind,
} from "@/server/domain/careers/resume-rules";
import { OTHER_POSITION, resumeFieldsSchema } from "@/lib/schemas/careers";

const pdf = Uint8Array.from([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37, 0x0a]);
const doc = Uint8Array.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1, 0x00]);
const zipWithWord = Uint8Array.from([
  0x50,
  0x4b,
  0x03,
  0x04,
  ...Buffer.from("[Content_Types].xml word/document.xml"),
]);
const zipPlain = Uint8Array.from([0x50, 0x4b, 0x03, 0x04, ...Buffer.from("notes.txt")]);
const png = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe("detectResumeKind", () => {
  it("reads PDF, old Word and Word documents from their first bytes", () => {
    expect(detectResumeKind(pdf)).toBe("pdf");
    expect(detectResumeKind(doc)).toBe("doc");
    expect(detectResumeKind(zipWithWord)).toBe("docx");
  });

  it("refuses a plain ZIP, an image, a script and empty bytes", () => {
    expect(detectResumeKind(zipPlain)).toBeNull();
    expect(detectResumeKind(png)).toBeNull();
    expect(detectResumeKind(Buffer.from("<script>alert(1)</script>"))).toBeNull();
    expect(detectResumeKind(new Uint8Array())).toBeNull();
  });
});

describe("checkResumeUpload", () => {
  it("accepts a real PDF with a .pdf name", () => {
    const result = checkResumeUpload({ size: pdf.length, fileName: "My CV.PDF", bytes: pdf });
    expect(result).toMatchObject({ ok: true, kind: "pdf", extension: "pdf" });
  });

  it("accepts .doc and .docx files", () => {
    expect(checkResumeUpload({ size: 9, fileName: "cv.doc", bytes: doc }).ok).toBe(true);
    expect(checkResumeUpload({ size: 50, fileName: "cv.docx", bytes: zipWithWord }).ok).toBe(true);
  });

  it("refuses a file whose name says one thing and whose contents say another", () => {
    const result = checkResumeUpload({ size: pdf.length, fileName: "cv.docx", bytes: pdf });
    expect(result.ok).toBe(false);
    const renamed = checkResumeUpload({ size: png.length, fileName: "cv.pdf", bytes: png });
    expect(renamed.ok).toBe(false);
  });

  it("refuses an empty file and one over the size limit", () => {
    expect(checkResumeUpload({ size: 0, fileName: "cv.pdf", bytes: pdf }).ok).toBe(false);
    expect(
      checkResumeUpload({ size: 4 * 1024 * 1024 + 1, fileName: "cv.pdf", bytes: pdf }).ok,
    ).toBe(false);
    expect(checkResumeUpload({ size: 4 * 1024 * 1024, fileName: "cv.pdf", bytes: pdf }).ok).toBe(
      true,
    );
  });
});

describe("cleanFileName", () => {
  it("keeps only the file's own name, never a folder", () => {
    expect(cleanFileName("C:\\Users\\me\\cv.pdf")).toBe("cv.pdf");
    expect(cleanFileName("../../etc/passwd")).toBe("passwd");
  });

  it("drops control characters and characters that break paths, and bounds the length", () => {
    expect(cleanFileName('a<b>:"c|d?*\u0000e.pdf')).toBe("abcde.pdf");
    expect(cleanFileName("x".repeat(500)).length).toBe(120);
    expect(cleanFileName("///")).toBe("resume");
  });
});

describe("resumeFieldsSchema", () => {
  const valid = {
    fullName: "Anita Rao",
    email: " Anita@Example.com ",
    position: "Business Development Manager",
  };

  it("accepts the minimum and tidies the email", () => {
    const parsed = resumeFieldsSchema.parse(valid);
    expect(parsed.email).toBe("anita@example.com");
    expect(parsed.phone).toBeUndefined();
    expect(parsed.message).toBeUndefined();
  });

  it("accepts the general application option and a phone with country code", () => {
    expect(
      resumeFieldsSchema.safeParse({ ...valid, position: OTHER_POSITION, phone: "+919876543210" })
        .success,
    ).toBe(true);
  });

  it("refuses a position that is not on the list, a bad email and a bad phone", () => {
    expect(resumeFieldsSchema.safeParse({ ...valid, position: "CEO" }).success).toBe(false);
    expect(resumeFieldsSchema.safeParse({ ...valid, email: "nope" }).success).toBe(false);
    expect(resumeFieldsSchema.safeParse({ ...valid, phone: "98765" }).success).toBe(false);
  });

  it("refuses a name that is too short and a note that is too long", () => {
    expect(resumeFieldsSchema.safeParse({ ...valid, fullName: "A" }).success).toBe(false);
    expect(resumeFieldsSchema.safeParse({ ...valid, message: "x".repeat(1001) }).success).toBe(
      false,
    );
  });
});
