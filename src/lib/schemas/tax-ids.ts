import { z } from "zod";

/** PAN and GSTIN formats, defined once for members, vendors and admin edits. Empty means "not provided". */

export const optionalPanSchema = z
  .string()
  .trim()
  .toUpperCase()
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine((v) => !v || /^[A-Z]{5}\d{4}[A-Z]$/.test(v), "Enter a valid PAN, e.g. ABCDE1234F.");

export const optionalGstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .optional()
  .transform((v) => (v ? v : undefined))
  .refine(
    (v) => !v || /^\d{2}[A-Z]{5}\d{4}[A-Z][0-9A-Z]Z[0-9A-Z]$/.test(v),
    "Enter a valid 15-character GSTIN.",
  );
