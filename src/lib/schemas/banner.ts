import { z } from "zod";

/**
 * Where a banner button may point: a page on this site ("/products") or an https link. Anything
 * else is refused, above all `javascript:` and `data:` links, which would turn a banner into a way
 * to run script on the home page for every visitor.
 */
export function isSafeBannerHref(value: string): boolean {
  if (value.length > 300 || /[\s<>"'\\]/.test(value)) return false;
  if (value.startsWith("/")) return !value.startsWith("//");
  try {
    const url = new URL(value);
    return url.protocol === "https:" && Boolean(url.hostname);
  } catch {
    return false;
  }
}

/** Where a banner shows: the public home page, or members' and sellers' dashboards. */
export const BANNER_PLACEMENTS = ["HOME", "DASHBOARD"] as const;
export const bannerPlacementSchema = z.enum(BANNER_PLACEMENTS);

export const bannerFieldsSchema = z.object({
  placement: bannerPlacementSchema.default("HOME"),
  headline: z
    .string()
    .trim()
    .min(3, "Write the headline.")
    .max(120, "Keep the headline under 120 characters."),
  subline: z
    .string()
    .trim()
    .max(200, "Keep this under 200 characters.")
    .optional()
    .transform((v) => (v ? v : undefined)),
  ctaLabel: z
    .string()
    .trim()
    .min(2, "Write the button text.")
    .max(30, "Keep the button text short."),
  ctaHref: z
    .string()
    .trim()
    .refine(
      isSafeBannerHref,
      "Use a page on this site like /products, or a link starting with https://",
    ),
});
export type BannerFields = z.infer<typeof bannerFieldsSchema>;

export const bannerIdSchema = z.string().uuid();
export const bannerMoveSchema = z.enum(["UP", "DOWN"]);
