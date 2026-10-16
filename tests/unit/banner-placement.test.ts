import { describe, expect, it } from "vitest";
import { bannerFieldsSchema } from "@/lib/schemas/banner";
import { adFieldsSchema } from "@/lib/schemas/ad";

const fields = {
  headline: "Refer a friend",
  ctaLabel: "See more",
  ctaHref: "/referrals",
};

describe("banner placement", () => {
  it("defaults to the home page, so existing banners and old forms keep working", () => {
    const result = bannerFieldsSchema.safeParse(fields);
    expect(result.success && result.data.placement).toBe("HOME");
  });

  it("accepts the home page and the dashboards, and nothing else", () => {
    expect(bannerFieldsSchema.safeParse({ ...fields, placement: "DASHBOARD" }).success).toBe(true);
    expect(bannerFieldsSchema.safeParse({ ...fields, placement: "HOME" }).success).toBe(true);
    expect(bannerFieldsSchema.safeParse({ ...fields, placement: "SIDEBAR" }).success).toBe(false);
  });
});

describe("ad fields", () => {
  it("have no placement, because an ad is not a banner and the ads table has no such column", () => {
    const result = adFieldsSchema.safeParse({ ...fields, placement: "DASHBOARD" });
    expect(result.success).toBe(true);
    expect(result.success && "placement" in result.data).toBe(false);
  });
});
