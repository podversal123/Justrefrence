import { describe, expect, it } from "vitest";
import { DEFAULT_AFTER_LOGIN, safeNextPath } from "@/lib/safe-next";

describe("safeNextPath", () => {
  it("keeps a normal page on this site, with its query", () => {
    expect(safeNextPath("/admin/vendors")).toBe("/admin/vendors");
    expect(safeNextPath("/orders?tab=sales")).toBe("/orders?tab=sales");
    expect(safeNextPath("  /wallet  ")).toBe("/wallet");
  });

  it("refuses anything that could leave the site", () => {
    for (const bad of [
      "https://evil.example.com",
      "//evil.example.com",
      "/\\evil.example.com",
      "javascript:alert(1)",
      "evil.example.com",
      "data:text/html,x",
    ]) {
      expect(safeNextPath(bad), bad).toBe(DEFAULT_AFTER_LOGIN);
    }
  });

  it("refuses control characters, huge values and non-strings", () => {
    expect(safeNextPath("/ok\r\nSet-Cookie: x=1")).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeNextPath("/" + "a".repeat(400))).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeNextPath(null)).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeNextPath(undefined)).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeNextPath(42)).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeNextPath("")).toBe(DEFAULT_AFTER_LOGIN);
  });

  it("does not send people back to the sign-in pages", () => {
    expect(safeNextPath("/login")).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeNextPath("/login?next=/x")).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeNextPath("/register/verify")).toBe(DEFAULT_AFTER_LOGIN);
    expect(safeNextPath("/loginfoo")).toBe("/loginfoo");
  });
});
