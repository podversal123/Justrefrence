import { describe, expect, it } from "vitest";
import { assertEpinTransition, canTransitionEpin } from "@/server/domain/epin/epin-state-machine";

describe("canTransitionEpin", () => {
  it("allows a member to redeem a FRESH e-pin", () => {
    expect(canTransitionEpin("FRESH", "USED", "MEMBER")).toBe(true);
  });

  it("allows the system to expire a FRESH e-pin", () => {
    expect(canTransitionEpin("FRESH", "EXPIRED", "SYSTEM")).toBe(true);
  });

  it("denies a member from expiring an e-pin (system-only)", () => {
    expect(canTransitionEpin("FRESH", "EXPIRED", "MEMBER")).toBe(false);
  });

  it("allows only ADMIN to revoke a FRESH e-pin", () => {
    expect(canTransitionEpin("FRESH", "REVOKED", "ADMIN")).toBe(true);
    expect(canTransitionEpin("FRESH", "REVOKED", "MEMBER")).toBe(false);
    expect(canTransitionEpin("FRESH", "REVOKED", "SYSTEM")).toBe(false);
  });

  it("treats USED, EXPIRED, and REVOKED as terminal", () => {
    expect(canTransitionEpin("USED", "FRESH", "ADMIN")).toBe(false);
    expect(canTransitionEpin("EXPIRED", "FRESH", "ADMIN")).toBe(false);
    expect(canTransitionEpin("REVOKED", "FRESH", "ADMIN")).toBe(false);
  });
});

describe("assertEpinTransition", () => {
  it("returns the target status on a legal transition", () => {
    expect(assertEpinTransition("FRESH", "USED", "MEMBER")).toBe("USED");
  });

  it("throws on an illegal transition", () => {
    expect(() => assertEpinTransition("USED", "FRESH", "ADMIN")).toThrow();
  });
});
