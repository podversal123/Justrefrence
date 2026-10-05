import { z } from "zod";
import { rupeesToPaise } from "@/lib/money-input";

/** Bidding & auctions — shared client+server validation. Prices are typed in rupees and become exact paise here. */

export const REQUIREMENT_KINDS = ["PRODUCT", "SERVICE", "PROJECT"] as const;
export const MIN_BIDDING_MINUTES = 5;
export const MAX_BIDDING_DAYS = 90;

const rupeesField = (label: string) =>
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

export const createRequirementSchema = z
  .object({
    title: z.string().trim().min(5, "Give the requirement a clear title.").max(150),
    description: z
      .string()
      .trim()
      .min(10, "Describe what you need (at least 10 characters).")
      .max(4000),
    itemKind: z.enum(REQUIREMENT_KINDS),
    categoryLabel: z.string().trim().max(80).optional(),
    quantity: z.coerce.number().int("Quantity must be a whole number.").min(1).max(1_000_000),
    unit: z.string().trim().min(1).max(20).default("units"),
    deliveryCity: z.string().trim().max(80).optional(),
    maxBudgetRupees: z.string().trim().optional(),
    type: z.enum(["TENDER", "REVERSE_AUCTION"]),
    closesAtLocal: z.string().trim(),
    minDecrementRupees: z.string().trim().optional(),
    autoExtendMinutes: z.coerce.number().int().min(0).max(30).default(0),
  })
  .superRefine((data, ctx) => {
    if (data.maxBudgetRupees && rupeesToPaise(data.maxBudgetRupees) === null) {
      ctx.addIssue({
        code: "custom",
        path: ["maxBudgetRupees"],
        message: "Enter the budget in rupees, e.g. 50000.",
      });
    }
    if (
      data.type === "REVERSE_AUCTION" &&
      data.minDecrementRupees &&
      rupeesToPaise(data.minDecrementRupees) === null
    ) {
      ctx.addIssue({
        code: "custom",
        path: ["minDecrementRupees"],
        message: "Enter the minimum drop in rupees, e.g. 10.",
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
    title: data.title,
    description: data.description,
    itemKind: data.itemKind,
    categoryLabel: data.categoryLabel || null,
    quantity: data.quantity,
    unit: data.unit,
    deliveryCity: data.deliveryCity || null,
    estimatedValue: data.maxBudgetRupees ? rupeesToPaise(data.maxBudgetRupees) : null,
    type: data.type,
    closesAt: parseIst(data.closesAtLocal) as Date,
    minDecrement:
      data.type === "REVERSE_AUCTION" && data.minDecrementRupees
        ? (rupeesToPaise(data.minDecrementRupees) ?? 0n)
        : 0n,
    autoExtendMinutes: data.type === "REVERSE_AUCTION" ? data.autoExtendMinutes : 0,
  }));

export const placeBidSchema = z.object({
  requirementId: z.string().uuid(),
  unitPriceRupees: rupeesField("your price per unit"),
  deliveryDays: z.coerce.number().int("Delivery days must be a whole number.").min(1).max(365),
  note: z.string().trim().max(500, "Keep the note under 500 characters.").optional(),
});

export const bidActionSchema = z.object({
  requirementId: z.string().uuid(),
});

export const awardBidSchema = z.object({
  requirementId: z.string().uuid(),
  bidId: z.string().uuid(),
});

export const cancelRequirementSchema = z.object({
  requirementId: z.string().uuid(),
  reason: z.string().trim().min(3, "Give a short reason.").max(300),
});
