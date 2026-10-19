import { describe, expect, it } from "vitest";
import { isTwoStepPending, parseTwoStepCode, qrImageSrc } from "@/server/domain/identity/two-step";
import { siteSettingsSchema } from "@/lib/schemas/settings";

describe("parseTwoStepCode", () => {
  it("accepts six digits, with or without the spaces and dashes people type", () => {
    expect(parseTwoStepCode("482913")).toBe("482913");
    expect(parseTwoStepCode(" 482 913 ")).toBe("482913");
    expect(parseTwoStepCode("482-913")).toBe("482913");
  });

  it("rejects anything that is not exactly six digits", () => {
    for (const bad of ["", "12345", "1234567", "12345a", "abcdef", null, undefined, 123456]) {
      expect(parseTwoStepCode(bad), String(bad)).toBeNull();
    }
  });
});

describe("isTwoStepPending", () => {
  const base = { required: true, isStaff: true, level: "aal1" as string | null | undefined };

  it("holds staff at the first level while the requirement is on", () => {
    expect(isTwoStepPending(base)).toBe(true);
  });

  it("lets staff through once they have entered a code this session", () => {
    expect(isTwoStepPending({ ...base, level: "aal2" })).toBe(false);
  });

  it("does not hold anyone while the requirement is off, or hold members at all", () => {
    expect(isTwoStepPending({ ...base, required: false })).toBe(false);
    expect(isTwoStepPending({ ...base, isStaff: false })).toBe(false);
  });

  it("treats an unknown level as not finished, so a failed lookup never lets anyone in", () => {
    expect(isTwoStepPending({ ...base, level: null })).toBe(true);
    expect(isTwoStepPending({ ...base, level: undefined })).toBe(true);
  });
});

describe("qrImageSrc", () => {
  it("makes an image address that survives characters in the SVG", () => {
    const src = qrImageSrc("<svg a=\"1\" b='2'>#</svg>");
    expect(src.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(src).not.toContain("<");
    expect(src).not.toContain("#");
  });
});

describe("site settings: staff two-step switch", () => {
  const base = { idleLogoutMinutes: "30" };

  it("is on only when the checkbox sends 'on'", () => {
    expect(
      siteSettingsSchema.parse({ ...base, staffTwoStepRequired: "on" }).staffTwoStepRequired,
    ).toBe(true);
    expect(siteSettingsSchema.parse({ ...base }).staffTwoStepRequired).toBe(false);
  });
});
