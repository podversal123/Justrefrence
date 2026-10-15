import { describe, expect, it } from "vitest";
import { buildTracking } from "@/lib/order-tracking";

const at = (day: number) => new Date(Date.UTC(2026, 9, day));
const history = (...pairs: [string, number, string?][]) =>
  pairs.map(([toStatus, day, reason]) => ({ toStatus, createdAt: at(day), reason: reason ?? null }));

describe("buildTracking", () => {
  it("marks earlier steps done, the current one now, and the rest upcoming", () => {
    const { steps, ending } = buildTracking(
      "PROCESSING",
      history(["PLACED", 1], ["PAID", 2], ["PROCESSING", 3]),
    );
    expect(steps.map((s) => s.state)).toEqual([
      "done",
      "done",
      "current",
      "upcoming",
      "upcoming",
      "upcoming",
    ]);
    expect(steps[2]?.at).toEqual(at(3));
    expect(steps[3]?.at).toBeNull();
    expect(ending).toBeNull();
  });

  it("treats a completed order as fully done", () => {
    const { steps } = buildTracking(
      "COMPLETED",
      history(["PLACED", 1], ["PAID", 2], ["PROCESSING", 3], ["SHIPPED", 4], ["DELIVERED", 5], ["COMPLETED", 6]),
    );
    expect(steps.every((s) => s.state === "done")).toBe(true);
  });

  it("stops a cancelled order at the steps it reached, with the reason", () => {
    const { steps, ending } = buildTracking(
      "CANCELLED",
      history(["PLACED", 1], ["CANCELLED", 2, "Changed my mind"]),
    );
    expect(steps.map((s) => s.status)).toEqual(["PLACED"]);
    expect(ending).toEqual({ status: "CANCELLED", at: at(2), reason: "Changed my mind" });
  });

  it("shows a refund after the steps that were passed", () => {
    const { steps, ending } = buildTracking(
      "REFUNDED",
      history(["PLACED", 1], ["PAID", 2], ["REFUNDED", 4]),
    );
    expect(steps.map((s) => s.status)).toEqual(["PLACED", "PAID"]);
    expect(ending?.status).toBe("REFUNDED");
  });

  it("does not depend on the order the history rows arrive in", () => {
    const { steps } = buildTracking("PAID", history(["PAID", 2], ["PLACED", 1]));
    expect(steps[0]?.at).toEqual(at(1));
    expect(steps[1]?.at).toEqual(at(2));
  });
});
