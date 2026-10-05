import { describe, expect, it } from "vitest";
import { formatOrderNumber } from "@/server/domain/commerce/order-number";

describe("formatOrderNumber", () => {
  it("zero-pads to 6 digits with an ORD- prefix", () => {
    expect(formatOrderNumber(1n)).toBe("ORD-000001");
    expect(formatOrderNumber(482n)).toBe("ORD-000482");
  });

  it("does not truncate a sequence longer than the pad width", () => {
    expect(formatOrderNumber(1234567n)).toBe("ORD-1234567");
  });
});
