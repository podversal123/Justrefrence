import { z } from "zod";
import { couponDateOnly, couponPercentToBps, couponRupees } from "@/lib/schemas/coupon";

/** Paying a reward — shared client+server validation. A reward is a coupon for one member. Amounts are typed in rupees / percent and converted exactly (no floats). */

/** Today's date in IST, as YYYY-MM-DD. Everyone on the platform sees IST, so "last day" means the IST day. */
function todayIst(): string {
  return new Date(Date.now() + 5.5 * 3_600_000).toISOString().slice(0, 10);
}

export const grantRewardSchema = z
  .object({
    userId: z.string().uuid("Find the member first."),
    title: z.string().trim().min(3, "Give the reward a short name.").max(100),
    reason: z
      .string()
      .trim()
      .min(5, "Say why this reward is being paid (at least 5 characters).")
      .max(300),
    idempotencyKey: z.string().uuid(),
    discountType: z.enum(["PERCENT", "FIXED"]).optional(),
    percent: z.string().trim().optional(),
    fixedRupees: z.string().trim().optional(),
    minOrderRupees: z.string().trim().optional(),
    /** The last day the coupon can be used. */
    expiresOn: z.string().trim().optional(),
  })
  .superRefine((data, ctx) => {
    const issue = (path: string, message: string) =>
      ctx.addIssue({ code: "custom", path: [path], message });

    if (data.discountType === "PERCENT") {
      const parsed = couponPercentToBps.safeParse(data.percent ?? "");
      if (!parsed.success)
        issue("percent", parsed.error.issues[0]?.message ?? "Enter a percentage.");
    } else if (data.discountType === "FIXED") {
      const parsed = couponRupees.safeParse(data.fixedRupees ?? "");
      if (!parsed.success)
        issue("fixedRupees", parsed.error.issues[0]?.message ?? "Enter an amount.");
      else if (parsed.data <= 0n) issue("fixedRupees", "Discount must be more than zero.");
    } else {
      issue("discountType", "Choose how the coupon discounts.");
    }
    if (data.minOrderRupees && !couponRupees.safeParse(data.minOrderRupees).success) {
      issue("minOrderRupees", "Enter an amount in rupees, e.g. 500.");
    }

    if (!data.expiresOn) issue("expiresOn", "Choose the last day the coupon can be used.");
    else if (!couponDateOnly.safeParse(data.expiresOn).success)
      issue("expiresOn", "Choose a date.");
    else if (data.expiresOn < todayIst()) issue("expiresOn", "That date has already passed.");
  })
  .transform((data) => ({
    userId: data.userId,
    title: data.title,
    reason: data.reason,
    idempotencyKey: data.idempotencyKey,
    discountType: data.discountType as "PERCENT" | "FIXED",
    valuePercentBps:
      data.discountType === "PERCENT" ? couponPercentToBps.parse(data.percent) : null,
    valueFixed: data.discountType === "FIXED" ? couponRupees.parse(data.fixedRupees) : null,
    minOrderAmount: data.minOrderRupees ? couponRupees.parse(data.minOrderRupees) : 0n,
    // Valid THROUGH the chosen day: expires at the end of that day in IST.
    expiresAt: new Date(`${data.expiresOn}T23:59:59.999+05:30`),
  }));

export type GrantRewardInput = z.infer<typeof grantRewardSchema>;
