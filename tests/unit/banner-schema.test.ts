import { describe, expect, it } from "vitest";
import { bannerFieldsSchema, isSafeBannerHref } from "@/lib/schemas/banner";

describe("isSafeBannerHref", () => {
  it("allows a page on this site and an https link", () => {
    for (const ok of [
      "/products",
      "/bids?type=auction",
      "/register#top",
      "https://example.com/offer",
    ]) {
      expect(isSafeBannerHref(ok)).toBe(true);
    }
  });

  it("refuses links that could run script or leave the site by stealth", () => {
    for (const bad of [
      "javascript:alert(1)",
      "JaVaScRiPt:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "//evil.example.com",
      "http://example.com",
      "ftp://example.com",
      "products",
      "/path with space",
      '/x"onmouseover="alert(1)',
      "",
    ]) {
      expect(isSafeBannerHref(bad)).toBe(false);
    }
  });

  it("refuses an over-long link", () => {
    expect(isSafeBannerHref("/" + "a".repeat(400))).toBe(false);
  });
});

describe("bannerFieldsSchema", () => {
  const ok = { headline: "Justice for all.", ctaLabel: "Browse", ctaHref: "/products" };

  it("accepts the basics and treats an empty subline as none", () => {
    const r = bannerFieldsSchema.safeParse({ ...ok, subline: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.subline).toBeUndefined();
  });

  it("explains what is wrong in plain words", () => {
    const r = bannerFieldsSchema.safeParse({
      headline: "A",
      ctaLabel: "",
      ctaHref: "javascript:1",
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const messages = Object.values(r.error.flatten().fieldErrors).flat().join(" ");
      expect(messages).toMatch(/headline/i);
      expect(messages).toMatch(/button text/i);
      expect(messages).toMatch(/page on this site/i);
    }
  });
});
