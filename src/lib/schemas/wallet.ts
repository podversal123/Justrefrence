import { z } from "zod";

/**
 * Wallet / payout / e-pin / subscription validation — see
 * docs/database-tables.md §6-8 and the Phase 7 brief. Shared
 * client+server source of truth, same convention as every other schema file.
 */

export const walletPinSchema = z.object({
  pin: z.string().trim().regex(/^\d{6}$/, "Enter a 6-digit PIN."),
  confirmPin: z.string().trim(),
}).refine((data) => data.pin === data.confirmPin, {
  message: "PINs do not match.",
  path: ["confirmPin"],
});
export type WalletPinInput = z.infer<typeof walletPinSchema>;

export const requestPayoutSchema = z.object({
  bankAccountId: z.string().uuid(),
  amountRupees: z.coerce.number().positive("Enter an amount greater than zero."),
  idempotencyKey: z.string().uuid(),
  walletPin: z
    .string()
    .trim()
    .regex(/^\d{6}$/)
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type RequestPayoutInput = z.infer<typeof requestPayoutSchema>;

export const payoutStatusSchema = z.enum(["REQUESTED", "APPROVED", "REJECTED", "PROCESSING", "PAID", "FAILED"]);

export const updatePayoutStatusSchema = z
  .object({
    payoutRequestId: z.string().uuid(),
    status: payoutStatusSchema,
    rejectedReason: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((v) => (v ? v : undefined)),
    transferReference: z
      .string()
      .trim()
      .max(100)
      .optional()
      .transform((v) => (v ? v : undefined)),
    tdsDeductedRupees: z.coerce.number().min(0).optional(),
  })
  .refine((data) => data.status !== "REJECTED" || !!data.rejectedReason?.length, {
    message: "A reason is required when rejecting a payout.",
    path: ["rejectedReason"],
  });
export type UpdatePayoutStatusInput = z.infer<typeof updatePayoutStatusSchema>;

export const adminCreditWalletSchema = z.object({
  userId: z.string().uuid(),
  amountRupees: z.coerce.number().positive("Enter an amount greater than zero."),
  reference: z.string().trim().min(2, "Enter a reference, e.g. a bank UTR or receipt number.").max(200),
  idempotencyKey: z.string().uuid(),
});
export type AdminCreditWalletInput = z.infer<typeof adminCreditWalletSchema>;

/** `/admin/payouts` queue filters — cursor pagination, same convention as vendorListQuerySchema. */
export const adminPayoutListQuerySchema = z.object({
  status: payoutStatusSchema.optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminPayoutListQuery = z.infer<typeof adminPayoutListQuerySchema>;

export const subscriptionPlanTypeSchema = z.enum(["YEARLY", "TIME_BOUND", "LIFETIME"]);

export const createSubscriptionPlanSchema = z
  .object({
    code: z.string().trim().toUpperCase().min(2).max(40),
    type: subscriptionPlanTypeSchema,
    priceRupees: z.coerce.number().positive("Enter a price greater than zero."),
    durationDays: z
      .coerce.number()
      .int()
      .positive()
      .optional()
      .transform((v) => (v ? v : undefined)),
    benefits: z
      .string()
      .trim()
      .optional()
      .transform((v) => (v ? v : undefined)),
  })
  .refine((data) => data.type === "LIFETIME" || data.durationDays !== undefined, {
    message: "Enter a duration in days for a yearly or time-bound plan.",
    path: ["durationDays"],
  });
export type CreateSubscriptionPlanInput = z.infer<typeof createSubscriptionPlanSchema>;

export const generateEpinSchema = z.object({
  planId: z.string().uuid(),
  expiresInDays: z
    .coerce.number()
    .int()
    .positive()
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type GenerateEpinInput = z.infer<typeof generateEpinSchema>;

export const redeemEpinSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{16}$/, "Enter a valid 16-character e-pin code."),
});
export type RedeemEpinInput = z.infer<typeof redeemEpinSchema>;

export const epinStatusSchema = z.enum(["FRESH", "USED", "EXPIRED", "REVOKED"]);

export const epinSearchQuerySchema = z.object({
  status: epinStatusSchema.optional(),
  codeLast4: z
    .string()
    .trim()
    .regex(/^[A-Z0-9]{4}$/)
    .optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type EpinSearchQuery = z.infer<typeof epinSearchQuerySchema>;
