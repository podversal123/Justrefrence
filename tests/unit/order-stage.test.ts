import { describe, expect, it } from "vitest";
import { ORDER_STATUSES } from "@/server/domain/commerce/order-state-machine";
import {
  PROJECT_STAGES,
  statusesForProjectStage,
  statusesForSaleStage,
} from "@/server/domain/commerce/order-stage";
import { projectsViewQuerySchema, saleViewQuerySchema } from "@/lib/schemas/commerce";

describe("project stages", () => {
  it("puts every order status in exactly one stage", () => {
    const all = PROJECT_STAGES.flatMap((stage) => [...statusesForProjectStage(stage)]);
    expect([...all].sort()).toEqual([...ORDER_STATUSES].sort());
  });

  it("treats cancelled and refunded as cancelled, and keeps delivered running until completed", () => {
    expect(statusesForProjectStage("cancelled")).toEqual(["CANCELLED", "REFUNDED"]);
    expect(statusesForProjectStage("complete")).toEqual(["COMPLETED"]);
    expect(statusesForProjectStage("running")).toContain("DELIVERED");
  });
});

describe("sale and purchase stages", () => {
  it("splits every order status between new and old with no overlap", () => {
    const fresh = statusesForSaleStage("new");
    const old = statusesForSaleStage("old");
    expect(fresh.filter((s) => old.includes(s))).toEqual([]);
    expect([...fresh, ...old].sort()).toEqual([...ORDER_STATUSES].sort());
  });

  it("calls an order old once it is completed, cancelled or refunded", () => {
    expect(statusesForSaleStage("old")).toEqual(["COMPLETED", "CANCELLED", "REFUNDED"]);
  });
});

describe("page query parsing", () => {
  it("falls back to safe defaults on junk input instead of failing", () => {
    expect(projectsViewQuerySchema.parse({ side: "x", stage: "y", cursor: "not-a-uuid" })).toEqual({
      side: "ordered",
      stage: "running",
      cursor: undefined,
    });
    expect(saleViewQuerySchema.parse({})).toEqual({
      side: "purchase",
      stage: "new",
      cursor: undefined,
    });
  });

  it("keeps valid choices", () => {
    expect(saleViewQuerySchema.parse({ side: "sale", stage: "old" })).toMatchObject({
      side: "sale",
      stage: "old",
    });
    expect(projectsViewQuerySchema.parse({ side: "sold", stage: "cancelled" })).toMatchObject({
      side: "sold",
      stage: "cancelled",
    });
  });
});
