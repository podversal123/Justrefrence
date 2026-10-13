import { z } from "zod";

/**
 * Phone-number fields, defined once so every form and server action validates them the same way.
 *  - mobile: international format with country code, e.g. +919876543210 (what OTP and WhatsApp need)
 *  - landline: a looser local number, e.g. 011-2345 6789 or +91 11 23456789
 * Optional variants treat an empty field as "not provided".
 */

const MOBILE_RE = /^\+?[1-9]\d{9,14}$/;
const MOBILE_MESSAGE = "Enter a valid mobile number with country code, e.g. +919876543210.";

export const mobileSchema = z.string().trim().regex(MOBILE_RE, MOBILE_MESSAGE);

export const optionalMobileSchema = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => !v || MOBILE_RE.test(v), MOBILE_MESSAGE);

/** Landline: 6 to 15 digits once spaces, dashes, dots and brackets are stripped; stored as typed (trimmed). */
export const optionalLandlineSchema = z
  .string()
  .trim()
  .max(30)
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => {
    if (!v) return true;
    if (!/^[+\d(][\d\s\-.()]*$/.test(v)) return false;
    const digits = v.replace(/\D/g, "");
    return digits.length >= 6 && digits.length <= 15;
  }, "Enter a valid telephone number, e.g. 011-23456789.");
