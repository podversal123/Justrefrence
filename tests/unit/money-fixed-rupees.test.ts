import { describe, expect, it } from "vitest";
import { paiseToFixedRupees } from "@/lib/money";

describe("paiseToFixedRupees", () => {
  it("always shows two decimals", () => {
    expect(paiseToFixedRupees(150000n)).toBe("1500.00");
    expect(paiseToFixedRupees(149950n)).toBe("1499.50");
    expect(paiseToFixedRupees("5")).toBe("0.05");
    expect(paiseToFixedRupees(0n)).toBe("0.00");
  });

  it("handles negatives and amounts beyond Number's exact range", () => {
    expect(paiseToFixedRupees(-150n)).toBe("-1.50");
    expect(paiseToFixedRupees(9007199254740993n)).toBe("90071992547409.93");
  });
});
