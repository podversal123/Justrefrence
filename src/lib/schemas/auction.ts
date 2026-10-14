import { z } from "zod";
import { rupeesToPaise } from "@/lib/money-input";
import { MAX_BIDDING_DAYS, MIN_BIDDING_MINUTES } from "@/lib/schemas/bidding";

/** Forward auctions — shared client+server validation. Prices are typed in rupees and become exact paise here. */

export const AUCTION_ITEM_KINDS = ["PRODUCT", "SERVICE", "PROJECT"] as const;

const rupees = (label: string) =>
  z
    .string()
    .trim()
    .transform((value, ctx) => {
      const paise = rupeesToPaise(value);
      if (paise === null) {
        ctx.addIssue({
          code: "custom",
          message: `Enter ${label} in rupees, e.g. 1500 or 1499.50.`,
        });
        return z.NEVER;
      }
      return paise;
    });

/** `datetime-local` has no zone; everyone on the platform sees IST, so it is read as IST. */
function parseIst(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  const date = new Date(`${value}:00+05:30`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export const createAuctionSchema = z
  .object({
    itemType: z.enum(AUCTION_ITEM_KINDS),
    itemId: z.string().uuid("Choose one of your listings."),
    description: z.string().trim().max(2000).optional(),
    quantity: z.coerce.number().int("Quantity must be a whole number.").min(1).max(1_000_000),
    startPriceRupees: rupees("the starting price"),
    reservePriceRupees: z.string().trim().optional(),
    minIncrementRupees: z.string().trim().optional(),
    autoExtendMinutes: z.coerce.number().int().min(0).max(30).default(0),
    closesAtLocal: z.string().trim(),
  })
  .superRefine((data, ctx) => {
    if (data.startPriceRupees <= 0n) {
      ctx.addIssue({
        code: "custom",
        path: ["startPriceRupees"],
        message: "The starting price must be more than zero.",
      });
    }
    if (data.reservePriceRupees) {
      const reserve = rupeesToPaise(data.reservePriceRupees);
      if (reserve === null) {
        ctx.addIssue({
          code: "custom",
          path: ["reservePriceRupees"],
          message: "Enter the lowest price you will accept in rupees, e.g. 5000.",
        });
      } else if (reserve < data.startPriceRupees) {
        ctx.addIssue({
          code: "custom",
          path: ["reservePriceRupees"],
          message: "The lowest price you accept can't be below the starting price.",
        });
      }
    }
    if (data.minIncrementRupees && rupeesToPaise(data.minIncrementRupees) === null) {
      ctx.addIssue({
        code: "custom",
        path: ["minIncrementRupees"],
        message: "Enter the minimum raise in rupees, e.g. 50.",
      });
    }
    const closes = parseIst(data.closesAtLocal);
    if (!closes) {
      ctx.addIssue({
        code: "custom",
        path: ["closesAtLocal"],
        message: "Choose when bidding closes.",
      });
    } else {
      const now = Date.now();
      if (closes.getTime() < now + MIN_BIDDING_MINUTES * 60_000) {
        ctx.addIssue({
          code: "custom",
          path: ["closesAtLocal"],
          message: `Bidding must stay open at least ${MIN_BIDDING_MINUTES} minutes.`,
        });
      } else if (closes.getTime() > now + MAX_BIDDING_DAYS * 86_400_000) {
        ctx.addIssue({
          code: "custom",
          path: ["closesAtLocal"],
          message: `Bidding can stay open at most ${MAX_BIDDING_DAYS} days.`,
        });
      }
    }
  })
  .transform((data) => ({
    itemType: data.itemType,
    itemId: data.itemId,
    description: data.description || null,
    quantity: data.quantity,
    startPrice: data.startPriceRupees,
    reservePrice: data.reservePriceRupees ? rupeesToPaise(data.reservePriceRupees) : null,
    minIncrement: data.minIncrementRupees ? (rupeesToPaise(data.minIncrementRupees) ?? 0n) : 0n,
    autoExtendMinutes: data.autoExtendMinutes,
    closesAt: parseIst(data.closesAtLocal) as Date,
  }));

export const placeAuctionBidSchema = z.object({
  auctionId: z.string().uuid(),
  unitPriceRupees: rupees("your bid per unit"),
});

export const auctionIdSchema = z.object({ auctionId: z.string().uuid() });

export const cancelAuctionSchema = z.object({
  auctionId: z.string().uuid(),
  reason: z.string().trim().min(3, "Give a short reason.").max(300),
});
