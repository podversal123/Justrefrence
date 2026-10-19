import { MEMBER_ID_PATTERN } from "@/server/domain/identity/member-id";
import { z } from "zod";

/**
 * Shared client+server validation — see docs/error-handling.md §1 and
 * docs/security.md §2. These are the only source of truth for these forms'
 * validation rules; both the client-side form and the Server Action import
 * from here.
 */

/** Sign in with an email address, or with the 10-digit Member ID (which is also the Referral ID). */
export const loginSchema = z.object({
  identifier: z
    .string()
    .trim()
    .toLowerCase()
    .refine(
      (value) => MEMBER_ID_PATTERN.test(value) || z.string().email().safeParse(value).success,
      "Enter your email or 10-digit Member ID.",
    ),
  password: z.string().min(1, "Enter your password."),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const forgotPasswordSchema = z.object({
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
});
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;

export const passwordRules = z
  .string()
  .min(10, "Password must be at least 10 characters.")
  .regex(/[a-z]/, "Password must include a lowercase letter.")
  .regex(/[A-Z]/, "Password must include an uppercase letter.")
  .regex(/[0-9]/, "Password must include a number.");

export const resetPasswordSchema = z
  .object({
    password: passwordRules,
    confirmPassword: z.string(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords do not match.",
    path: ["confirmPassword"],
  });
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
