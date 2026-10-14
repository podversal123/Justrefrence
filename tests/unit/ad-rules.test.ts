import { describe, expect, it } from "vitest";
import { adFieldsSchema, rejectAdSchema } from "@/lib/schemas/ad";
import {
  adStateLabel,
  canApprove,
  canPause,
  canReject,
  isShowing,
  type AdFacts,
} from "@/server/domain/ads/rules";

const ad = (status: AdFacts["status"], isActive = true): AdFacts => ({ status, isActive });

describe("isShowing", () => {
  it("shows only an approved ad that is not paused", () => {
    expect(isShowing(ad("APPROVED"))).toBe(true);
    expect(isShowing(ad("APPROVED", false))).toBe(false);
    expect(isShowing(ad("PENDING"))).toBe(false);
    expect(isShowing(ad("REJECTED"))).toBe(false);
  });
});

describe("adStateLabel", () => {
  it("describes each state in plain words", () => {
    expect(adStateLabel(ad("PENDING"))).toBe("Waiting for approval");
    expect(adStateLabel(ad("REJECTED"))).toBe("Not approved");
    expect(adStateLabel(ad("APPROVED"))).toBe("Showing on the home page");
    expect(adStateLabel(ad("APPROVED", false))).toBe("Paused");
  });
});

describe("review rules", () => {
  it("approves only an ad that is waiting", () => {
    expect(canApprove(ad("PENDING")).ok).toBe(true);
    expect(canApprove(ad("APPROVED")).ok).toBe(false);
    expect(canApprove(ad("REJECTED")).ok).toBe(false);
  });
  it("turns down a waiting or showing ad, but not one already turned down", () => {
    expect(canReject(ad("PENDING")).ok).toBe(true);
    expect(canReject(ad("APPROVED")).ok).toBe(true);
    expect(canReject(ad("REJECTED")).ok).toBe(false);
  });
  it("lets the vendor pause only an approved ad", () => {
    expect(canPause(ad("APPROVED")).ok).toBe(true);
    expect(canPause(ad("APPROVED", false)).ok).toBe(true);
    expect(canPause(ad("PENDING")).ok).toBe(false);
    expect(canPause(ad("REJECTED")).ok).toBe(false);
  });
});

describe("ad fields", () => {
  const valid = {
    headline: "Fresh office chairs",
    ctaLabel: "See chairs",
    ctaHref: "/products",
  };
  it("accepts a page on this site and an https link", () => {
    expect(adFieldsSchema.safeParse(valid).success).toBe(true);
    expect(
      adFieldsSchema.safeParse({ ...valid, ctaHref: "https://example.com/shop" }).success,
    ).toBe(true);
  });
  it("refuses links that could run script or leave the site oddly", () => {
    for (const ctaHref of [
      "javascript:alert(1)",
      "data:text/html,<b>x</b>",
      "//evil.example.com",
      "http://example.com",
      "/path with space",
    ]) {
      expect(adFieldsSchema.safeParse({ ...valid, ctaHref }).success).toBe(false);
    }
  });
  it("needs a headline and a button text", () => {
    expect(adFieldsSchema.safeParse({ ...valid, headline: "ab" }).success).toBe(false);
    expect(adFieldsSchema.safeParse({ ...valid, ctaLabel: "x" }).success).toBe(false);
  });
});

describe("rejectAdSchema", () => {
  const adId = "3f2b1c9e-8a4d-4e6b-9c1a-2d5e7f8a9b0c";
  it("needs a reason", () => {
    expect(rejectAdSchema.safeParse({ adId, reason: "no" }).success).toBe(false);
    expect(rejectAdSchema.safeParse({ adId, reason: "Photo is blurry" }).success).toBe(true);
  });
});
