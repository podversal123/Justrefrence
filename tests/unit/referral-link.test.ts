import { describe, expect, it } from "vitest";
import { buildReferralLink } from "@/server/domain/referral/referral-link";

describe("buildReferralLink", () => {
  it("builds a /register?ref= link from the referral code", () => {
    expect(buildReferralLink("https://justreference.in", "JR-000042")).toBe(
      "https://justreference.in/register?ref=JR-000042",
    );
  });

  it("strips a trailing slash on the base URL", () => {
    expect(buildReferralLink("https://justreference.in/", "JR-000042")).toBe(
      "https://justreference.in/register?ref=JR-000042",
    );
  });

  it("URL-encodes the referral code", () => {
    expect(buildReferralLink("https://justreference.in", "JR 000042")).toBe(
      "https://justreference.in/register?ref=JR%20000042",
    );
  });
});
