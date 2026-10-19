import { z } from "zod";
import { CAREERS_OPENINGS } from "@/lib/careers-content";
import { mobileSchema } from "@/lib/schemas/contact";

/** "Other" is for someone applying without a listed position. */
export const OTHER_POSITION = "Other / general application";
export const RESUME_POSITIONS = [...CAREERS_OPENINGS.positions, OTHER_POSITION] as const;

/** The text fields of the résumé form. The file itself is checked separately, from its bytes. */
export const resumeFieldsSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, "Enter your full name.")
    .max(80, "Keep your name under 80 characters."),
  email: z.string().trim().toLowerCase().email("Enter a valid email address."),
  phone: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value ? value : undefined))
    .refine((value) => value === undefined || mobileSchema.safeParse(value).success, {
      message: "Enter a valid mobile number with country code, e.g. +919876543210.",
    }),
  position: z.enum(RESUME_POSITIONS, { message: "Choose the position you are applying for." }),
  message: z
    .string()
    .trim()
    .max(1000, "Keep your note under 1000 characters.")
    .optional()
    .transform((value) => (value ? value : undefined)),
  /** A hidden field real people leave empty; a bot that fills every field fills this too. */
  website: z.string().max(0).optional(),
});

export const resumeReviewSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["NEW", "REVIEWED"]),
});

export const resumeIdSchema = z.object({ id: z.string().uuid() });
