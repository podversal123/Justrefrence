import { z } from "zod";

/** Coupon administration — shared client+server validation. Amounts are typed in rupees / percent and converted exactly (no floats). */

const rupees = z
  .string()
  .trim()
  .regex(/^\d{1,9}(\.\d{1,2})?$/, "Enter an amount in rupees, e.g. 200 or 199.50.")
  .transform((value) => {
    const [whole = "0", fraction = ""] = value.split(".");
    return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
  });

/** "10" -> 1000 basis points, "7.5" -> 750; must be within (0, 100]. */
const percentToBps = z
  .string()
  .trim()
  .regex(/^\d{1,3}(\.\d{1,2})?$/, "Enter a percentage, e.g. 10 or 7.5.")
  .transform((value) => {
    const [whole = "0", fraction = ""] = value.split(".");
    return Number(whole) * 100 + Number(fraction.padEnd(2, "0") || "0");
  })
  .refine((bps) => bps > 0 && bps <= 10000, "Percentage must be between 0.01 and 100.");

const optionalInt = (min: number, message: string) =>
  z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? Number(value) : undefined))
    .refine((value) => value === undefined || (Number.isInteger(value) && value >= min), message);

const dateOnly = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Choose a date.");

export const createCouponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9_-]{4,24}$/, "Use 4-24 letters, numbers, - or _."),
    discountType: z.enum(["PERCENT", "FIXED"]),
    percent: z.string().trim().optional(),
    fixedRupees: z.string().trim().optional(),
    minOrderRupees: z.string().trim().optional(),
    startsOn: dateOnly,
    expiresOn: z.string().trim().optional(),
    usageLimit: optionalInt(1, "Total uses must be a whole number of 1 or more."),
    usageLimitPerMember: optionalInt(1, "Uses per member must be 1 or more."),
  })
  .superRefine((data, ctx) => {
    if (data.discountType === "PERCENT") {
      const parsed = percentToBps.safeParse(data.percent ?? "");
      if (!parsed.success)
        ctx.addIssue({
          code: "custom",
          path: ["percent"],
          message: parsed.error.issues[0]?.message ?? "Enter a percentage.",
        });
    } else {
      const parsed = rupees.safeParse(data.fixedRupees ?? "");
      if (!parsed.success)
        ctx.addIssue({
          code: "custom",
          path: ["fixedRupees"],
          message: parsed.error.issues[0]?.message ?? "Enter an amount.",
        });
      else if (parsed.data <= 0n)
        ctx.addIssue({
          code: "custom",
          path: ["fixedRupees"],
          message: "Discount must be more than zero.",
        });
    }
    if (data.minOrderRupees) {
      const parsed = rupees.safeParse(data.minOrderRupees);
      if (!parsed.success)
        ctx.addIssue({
          code: "custom",
          path: ["minOrderRupees"],
          message: parsed.error.issues[0]?.message ?? "Enter an amount.",
        });
    }
    if (data.expiresOn) {
      if (!dateOnly.safeParse(data.expiresOn).success)
        ctx.addIssue({ code: "custom", path: ["expiresOn"], message: "Choose a date." });
      else if (data.expiresOn < data.startsOn)
        ctx.addIssue({
          code: "custom",
          path: ["expiresOn"],
          message: "Expiry can't be before the start date.",
        });
    }
  })
  .transform((data) => ({
    code: data.code,
    discountType: data.discountType,
    valuePercentBps: data.discountType === "PERCENT" ? percentToBps.parse(data.percent) : null,
    valueFixed: data.discountType === "FIXED" ? rupees.parse(data.fixedRupees) : null,
    minOrderAmount: data.minOrderRupees ? rupees.parse(data.minOrderRupees) : 0n,
    startsAt: new Date(`${data.startsOn}T00:00:00.000Z`),
    // Valid THROUGH the chosen day: expires at the end of it.
    expiresAt: data.expiresOn ? new Date(`${data.expiresOn}T23:59:59.999Z`) : null,
    usageLimit: data.usageLimit ?? null,
    usageLimitPerMember: data.usageLimitPerMember ?? 1,
  }));

export const setCouponActiveSchema = z.object({
  couponId: z.string().uuid(),
  active: z.enum(["true", "false"]).transform((v) => v === "true"),
});
