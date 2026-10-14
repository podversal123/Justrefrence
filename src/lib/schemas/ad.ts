import { z } from "zod";
import { bannerFieldsSchema } from "@/lib/schemas/banner";

/**
 * An ad has the same fields as a home page banner, with the same safe-link rule (a page on this
 * site, or https only, never javascript: or data: links).
 */
export const adFieldsSchema = bannerFieldsSchema;

export const adIdSchema = z.object({ adId: z.string().uuid() });

export const rejectAdSchema = z.object({
  adId: z.string().uuid(),
  reason: z
    .string()
    .trim()
    .min(3, "Give a short reason the vendor can act on.")
    .max(300, "Keep the reason under 300 characters."),
});
