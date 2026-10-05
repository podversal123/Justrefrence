import { describe, expect, it } from "vitest";
import {
  assertApprovalTransition,
  canTransitionApproval,
  editRequiresReapproval,
  isPubliclyVisible,
} from "@/server/domain/catalog/state-machine";

describe("canTransitionApproval", () => {
  it("allows PENDING -> APPROVED and PENDING -> REJECTED", () => {
    expect(canTransitionApproval("PENDING", "APPROVED")).toBe(true);
    expect(canTransitionApproval("PENDING", "REJECTED")).toBe(true);
  });

  it("allows REJECTED -> PENDING (resubmit) but not REJECTED -> APPROVED directly", () => {
    expect(canTransitionApproval("REJECTED", "PENDING")).toBe(true);
    expect(canTransitionApproval("REJECTED", "APPROVED")).toBe(false);
  });

  it("allows APPROVED -> PENDING (re-review) but not APPROVED -> REJECTED directly", () => {
    expect(canTransitionApproval("APPROVED", "PENDING")).toBe(true);
    expect(canTransitionApproval("APPROVED", "REJECTED")).toBe(false);
  });

  it("has no self-transitions", () => {
    expect(canTransitionApproval("PENDING", "PENDING")).toBe(false);
    expect(canTransitionApproval("APPROVED", "APPROVED")).toBe(false);
  });
});

describe("assertApprovalTransition", () => {
  it("throws with a descriptive message for an illegal transition", () => {
    expect(() => assertApprovalTransition("REJECTED", "APPROVED")).toThrow(
      "Cannot move a listing from REJECTED to APPROVED.",
    );
  });

  it("does not throw for a legal transition", () => {
    expect(() => assertApprovalTransition("PENDING", "APPROVED")).not.toThrow();
  });
});

describe("isPubliclyVisible", () => {
  it("requires both APPROVED and isActive", () => {
    expect(isPubliclyVisible("APPROVED", true)).toBe(true);
    expect(isPubliclyVisible("APPROVED", false)).toBe(false);
    expect(isPubliclyVisible("PENDING", true)).toBe(false);
    expect(isPubliclyVisible("REJECTED", true)).toBe(false);
  });
});

describe("editRequiresReapproval", () => {
  it("only sends an already-APPROVED listing back to PENDING on edit", () => {
    expect(editRequiresReapproval("APPROVED")).toBe(true);
    expect(editRequiresReapproval("PENDING")).toBe(false);
    expect(editRequiresReapproval("REJECTED")).toBe(false);
  });
});
