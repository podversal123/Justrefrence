import { describe, expect, it } from "vitest";
import {
  buildReferralPath,
  formatMemberId,
  referralPathSegment,
} from "@/server/domain/identity/member-id";

describe("formatMemberId", () => {
  it("zero-pads to 6 digits with a JR- prefix", () => {
    expect(formatMemberId(42n)).toBe("JR-000042");
    expect(formatMemberId(482n)).toBe("JR-000482");
  });

  it("does not truncate a sequence longer than the pad width", () => {
    expect(formatMemberId(1234567n)).toBe("JR-1234567");
  });
});

describe("referralPathSegment", () => {
  it("strips hyphens so the result is a valid ltree label", () => {
    const uuid = "11111111-2222-3333-4444-555555555555";
    const segment = referralPathSegment(uuid);
    expect(segment).toBe(uuid.replace(/-/g, ""));
    expect(segment).not.toContain("-");
  });
});

describe("buildReferralPath", () => {
  it("is just the member's own segment when there is no parent", () => {
    const id = "11111111-2222-3333-4444-555555555555";
    expect(buildReferralPath(null, id)).toBe(referralPathSegment(id));
  });

  it("appends the member's segment to the parent path", () => {
    const parentPath = "aaaa";
    const id = "11111111-2222-3333-4444-555555555555";
    expect(buildReferralPath(parentPath, id)).toBe(`aaaa.${referralPathSegment(id)}`);
  });
});
