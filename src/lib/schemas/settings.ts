import { z } from "zod";

/** Site settings (maintenance mode + public contact details) — shared client+server validation. */

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Keep this under ${max} characters.`)
    .optional()
    .transform((value) => value ?? "");

export const siteSettingsSchema = z.object({
  /** HTML checkboxes submit "on" when ticked and nothing when not. */
  maintenanceEnabled: z
    .string()
    .optional()
    .transform((value) => value === "on"),
  maintenanceMessage: optionalText(500),
  contactEmail: z
    .string()
    .trim()
    .max(120)
    .optional()
    .transform((value) => value ?? "")
    .refine(
      (value) => value === "" || z.string().email().safeParse(value).success,
      "Enter a valid email address.",
    ),
  contactPhone: z
    .string()
    .trim()
    .max(30)
    .optional()
    .transform((value) => value ?? "")
    .refine(
      (value) => value === "" || /^[0-9+()\-\s]{6,30}$/.test(value),
      "Use digits, spaces, + ( ) or - only.",
    ),
  /** HTML checkboxes submit "on" when ticked and nothing when not. */
  staffTwoStepRequired: z
    .string()
    .optional()
    .transform((value) => value === "on"),
  contactAddress: optionalText(300),
  contactHours: optionalText(120),
  /** Empty means "use the default"; 0 turns auto logout off. */
  idleLogoutMinutes: z
    .string()
    .trim()
    .optional()
    .transform((value) => (value === undefined || value === "" ? "30" : value))
    .pipe(
      z
        .string()
        .regex(/^\d{1,4}$/, "Enter a whole number of minutes, or 0 to turn it off.")
        .transform(Number)
        .refine((n) => n === 0 || (n >= 5 && n <= 1440), "Use 0, or a number between 5 and 1440."),
    ),
});

export type SiteSettingsInput = z.infer<typeof siteSettingsSchema>;
