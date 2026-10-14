import { describe, expect, it } from "vitest";
import {
  cancelAuctionSchema,
  createAuctionSchema,
  placeAuctionBidSchema,
} from "@/lib/schemas/auction";

const ITEM_ID = "3f2b1c9e-8a4d-4e6b-9c1a-2d5e7f8a9b0c";

/** `datetime-local` text for IST "now + minutes", the way the form sends it. */
function istLocal(minutesFromNow: number): string {
  return new Date(Date.now() + minutesFromNow * 60_000 + 5.5 * 3_600_000)
    .toISOString()
    .slice(0, 16);
}

const valid = {
  itemType: "PRODUCT",
  itemId: ITEM_ID,
  quantity: "3",
  startPriceRupees: "1500.50",
  closesAtLocal: istLocal(60),
};

describe("createAuctionSchema", () => {
  it("converts rupees to exact paise and fills the defaults", () => {
    const result = createAuctionSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.startPrice).toBe(150050n);
    expect(result.data.reservePrice).toBeNull();
    expect(result.data.minIncrement).toBe(0n);
    expect(result.data.autoExtendMinutes).toBe(0);
    expect(result.data.quantity).toBe(3);
  });

  it("reads the closing time as IST", () => {
    const result = createAuctionSchema.safeParse({ ...valid, closesAtLocal: istLocal(60) });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const minutesAway = (result.data.closesAt.getTime() - Date.now()) / 60_000;
    expect(minutesAway).toBeGreaterThan(58);
    expect(minutesAway).toBeLessThan(62);
  });

  it("accepts a reserve and a minimum raise", () => {
    const result = createAuctionSchema.safeParse({
      ...valid,
      reservePriceRupees: "2000",
      minIncrementRupees: "25",
      autoExtendMinutes: "5",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.reservePrice).toBe(200000n);
    expect(result.data.minIncrement).toBe(2500n);
    expect(result.data.autoExtendMinutes).toBe(5);
  });

  it("refuses a reserve below the starting price", () => {
    const result = createAuctionSchema.safeParse({ ...valid, reservePriceRupees: "1000" });
    expect(result.success).toBe(false);
  });

  it("refuses a zero starting price and malformed money", () => {
    expect(createAuctionSchema.safeParse({ ...valid, startPriceRupees: "0" }).success).toBe(false);
    expect(createAuctionSchema.safeParse({ ...valid, startPriceRupees: "12.345" }).success).toBe(
      false,
    );
    expect(createAuctionSchema.safeParse({ ...valid, minIncrementRupees: "abc" }).success).toBe(
      false,
    );
  });

  it("refuses a closing time that is too soon, too far, or malformed", () => {
    expect(createAuctionSchema.safeParse({ ...valid, closesAtLocal: istLocal(2) }).success).toBe(
      false,
    );
    expect(
      createAuctionSchema.safeParse({ ...valid, closesAtLocal: istLocal(100 * 24 * 60) }).success,
    ).toBe(false);
    expect(createAuctionSchema.safeParse({ ...valid, closesAtLocal: "tomorrow" }).success).toBe(
      false,
    );
  });

  it("refuses a bad listing, kind or quantity", () => {
    expect(createAuctionSchema.safeParse({ ...valid, itemId: "nope" }).success).toBe(false);
    expect(createAuctionSchema.safeParse({ ...valid, itemType: "WIDGET" }).success).toBe(false);
    expect(createAuctionSchema.safeParse({ ...valid, quantity: "0" }).success).toBe(false);
    expect(createAuctionSchema.safeParse({ ...valid, quantity: "1.5" }).success).toBe(false);
  });
});

describe("placeAuctionBidSchema", () => {
  it("turns the typed rupees into paise", () => {
    const result = placeAuctionBidSchema.safeParse({ auctionId: ITEM_ID, unitPriceRupees: "99.5" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.unitPriceRupees).toBe(9950n);
  });
  it("refuses text and a bad id", () => {
    expect(
      placeAuctionBidSchema.safeParse({ auctionId: ITEM_ID, unitPriceRupees: "lots" }).success,
    ).toBe(false);
    expect(placeAuctionBidSchema.safeParse({ auctionId: "x", unitPriceRupees: "10" }).success).toBe(
      false,
    );
  });
});

describe("cancelAuctionSchema", () => {
  it("needs a short reason", () => {
    expect(cancelAuctionSchema.safeParse({ auctionId: ITEM_ID, reason: "ok" }).success).toBe(false);
    expect(
      cancelAuctionSchema.safeParse({ auctionId: ITEM_ID, reason: "Item damaged" }).success,
    ).toBe(true);
  });
});
