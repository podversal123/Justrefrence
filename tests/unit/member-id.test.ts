import { describe, expect, it } from "vitest";
import {
  MEMBER_ID_PATTERN,
  buildReferralPath,
  formatMemberId,
  referralPathSegment,
} from "@/server/domain/identity/member-id";

describe("formatMemberId", () => {
  it("always gives ten digits and never starts with 0", () => {
    for (const seq of [0n, 1n, 2n, 42n, 482n, 99_999n, 1_234_567n, 8_999_999_999n]) {
      const id = formatMemberId(seq);
      expect(id, String(seq)).toMatch(MEMBER_ID_PATTERN);
      expect(id[0]).not.toBe("0");
    }
  });

  it("gives the same ID for the same sequence every time", () => {
    expect(formatMemberId(7n)).toBe(formatMemberId(7n));
  });

  it("never gives two members the same ID", () => {
    const seen = new Set<string>();
    for (let seq = 1n; seq <= 20_000n; seq += 1n) seen.add(formatMemberId(seq));
    expect(seen.size).toBe(20_000);
  });

  it("does not run in order, so IDs are not guessable by counting up", () => {
    const ids = [1n, 2n, 3n, 4n, 5n].map((n) => BigInt(formatMemberId(n)));
    const steps = ids.slice(1).map((id, i) => id - ids[i]!);
    expect(steps.every((step) => step === 1n)).toBe(false);
  });

  it("refuses a sequence that would not fit in ten digits", () => {
    expect(() => formatMemberId(9_000_000_000n)).toThrow(RangeError);
    expect(() => formatMemberId(-1n)).toThrow(RangeError);
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
