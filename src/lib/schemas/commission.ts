import { z } from "zod";

/**
 * Commission rule configuration — admin-only (`commission_rule:update`,
 * SUPER_ADMIN only, see docs/rbac.md). Shared client+server source of
 * truth, same convention as every other schema file. Never hardcode a
 * rate anywhere else — this is the only way a rate enters the system.
 */

export const commissionApplicableToSchema = z.enum(["PRODUCT", "SERVICE", "PROJECT", "EPIN", "SUBSCRIPTION"]);
export const commissionRateBasisSchema = z.enum([
  "PERCENT_OF_ORDER",
  "PERCENT_OF_VENDOR_SALE",
  "PERCENT_OF_PLATFORM_FEE",
  "FIXED",
]);
export const commissionQualifyingEventSchema = z.enum(["ORDER_COMPLETED"]);

export const createCommissionRuleSchema = z
  .object({
    level: z.coerce.number().int().min(1).max(20),
    appliesTo: commissionApplicableToSchema,
    rateBasis: commissionRateBasisSchema,
    rateValuePercent: z
      .coerce.number()
      .min(0)
      .max(100)
      .optional()
      .transform((v) => (v === undefined ? undefined : Math.round(v * 100))),
    rateValueFixed: z
      .string()
      .trim()
      .regex(/^\d+$/, "Enter a whole number of paise.")
      .optional()
      .transform((v) => (v ? BigInt(v) : undefined)),
    qualifyingEvent: commissionQualifyingEventSchema,
    requiresActiveSubscription: z.coerce.boolean().default(false),
    minimumActivityCount: z
      .coerce.number()
      .int()
      .min(0)
      .optional()
      .transform((v) => (v === undefined || v === 0 ? undefined : v)),
    releaseDelayDays: z.coerce.number().int().min(0).max(365),
  })
  .refine((data) => data.rateBasis !== "FIXED" || data.rateValueFixed !== undefined, {
    message: "Enter a fixed amount (paise) for a FIXED-basis rule.",
    path: ["rateValueFixed"],
  })
  .refine((data) => data.rateBasis === "FIXED" || data.rateValuePercent !== undefined, {
    message: "Enter a percentage for a percent-basis rule.",
    path: ["rateValuePercent"],
  });
export type CreateCommissionRuleInput = z.infer<typeof createCommissionRuleSchema>;
