import { z } from "zod";
import { passwordRules } from "@/lib/schemas/auth";

/**
 * Member registration/profile validation — see docs/database-tables.md §1
 * and the Phase 4 brief. Shared client+server source of truth, same
 * convention as src/lib/schemas/auth.ts.
 */

const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[1-9]\d{9,14}$/, "Enter a valid mobile number, e.g. +919876543210.");

export const otpChannelSchema = z.enum(["EMAIL", "SMS", "WHATSAPP"]);
export type OtpChannelInput = z.infer<typeof otpChannelSchema>;

export const registerSchema = z
  .object({
    fullName: z.string().trim().min(2, "Enter your full name.").max(200),
    email: z.string().trim().toLowerCase().email("Enter a valid email address."),
    phone: phoneSchema,
    password: passwordRules,
    confirmPassword: z.string(),
    channel: otpChannelSchema,
    referralCode: z
      .string()
      .trim()
      .toUpperCase()
      .max(20)
      .optional()
      .transform((v) => (v ? v : undefined)),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });
export type RegisterInput = z.infer<typeof registerSchema>;

export const verifyRegistrationSchema = z.object({
  userId: z.string().uuid(),
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code."),
  referralCode: z
    .string()
    .trim()
    .toUpperCase()
    .max(20)
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type VerifyRegistrationInput = z.infer<typeof verifyRegistrationSchema>;

export const mobileLoginRequestSchema = z.object({
  phone: phoneSchema,
});
export type MobileLoginRequestInput = z.infer<typeof mobileLoginRequestSchema>;

export const mobileLoginVerifySchema = z.object({
  phone: phoneSchema,
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code."),
});
export type MobileLoginVerifyInput = z.infer<typeof mobileLoginVerifySchema>;

export const memberDetailsSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(200),
  dob: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => !v || !Number.isNaN(Date.parse(v)), "Enter a valid date."),
  pan: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => !v || /^[A-Z]{5}\d{4}[A-Z]$/.test(v), "Enter a valid PAN, e.g. ABCDE1234F."),
  gstin: z
    .string()
    .trim()
    .toUpperCase()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine(
      (v) => !v || /^\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(v),
      "Enter a valid 15-character GSTIN.",
    ),
  websiteUrl: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined))
    .refine((v) => !v || z.string().url().safeParse(v).success, "Enter a valid URL."),
  socialLinks: z
    .string()
    .trim()
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type MemberDetailsInput = z.infer<typeof memberDetailsSchema>;

export const addressTypeSchema = z.enum(["RESIDENCE", "OFFICE", "BILLING"]);

export const addressSchema = z.object({
  type: addressTypeSchema,
  line1: z.string().trim().min(3, "Enter the address line.").max(300),
  line2: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => (v ? v : undefined)),
  city: z.string().trim().min(2, "Enter a city.").max(120),
  state: z.string().trim().min(2, "Enter a state.").max(120),
  postalCode: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter a valid 6-digit PIN code."),
  country: z.string().trim().length(2).default("IN"),
});
export type AddressInput = z.infer<typeof addressSchema>;

export const bankAccountSchema = z.object({
  accountHolderName: z.string().trim().min(2, "Enter the account holder's name.").max(200),
  accountNumber: z
    .string()
    .trim()
    .regex(/^\d{9,18}$/, "Enter a valid bank account number."),
  ifsc: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, "Enter a valid IFSC code, e.g. HDFC0001234."),
  branchAddress: z
    .string()
    .trim()
    .max(300)
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type BankAccountInput = z.infer<typeof bankAccountSchema>;
