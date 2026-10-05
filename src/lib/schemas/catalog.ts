import { z } from "zod";
import { CATALOG_KINDS, type CatalogKind } from "@/server/domain/catalog/types";

/**
 * Shared catalog validation — see docs/adr/0011-catalog-architecture.md.
 * `getListingSchema(kind)` returns a kind-specific schema (Products need
 * stock/sku, Services need pricingType, Projects need neither) built from
 * one shared base rather than three independently maintained schemas.
 */

export const catalogKindSchema = z.enum(CATALOG_KINDS);

const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function slugify(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const categorySchema = z.object({
  name: z.string().trim().min(2, "Enter a category name.").max(100),
});
export type CategoryInput = z.infer<typeof categorySchema>;

export const subcategorySchema = z.object({
  categoryId: z.string().uuid("Choose a category."),
  name: z.string().trim().min(2, "Enter a subcategory name.").max(100),
});
export type SubcategoryInput = z.infer<typeof subcategorySchema>;

const baseListingFields = {
  kind: catalogKindSchema,
  categoryId: z.string().uuid("Choose a category."),
  subcategoryId: z.string().uuid().optional().or(z.literal("")),
  title: z.string().trim().min(3, "Enter a title.").max(200),
  description: z.string().trim().max(5000).optional().or(z.literal("")),
};

/**
 * Price as typed by a vendor — RUPEES, optionally with up to 2 decimals
 * ("1500", "1499.50") — converted to integer paise with exact string
 * arithmetic (never floating point, see docs/database.md "Money model").
 * Stored and passed around as BigInt paise from here on.
 */
const priceField = z
  .string()
  .trim()
  .regex(/^\d{1,10}(\.\d{1,2})?$/, "Enter the price in rupees, e.g. 1500 or 1499.50.")
  .transform((value) => {
    const [rupees = "0", fraction = ""] = value.split(".");
    return BigInt(rupees) * 100n + BigInt(fraction.padEnd(2, "0") || "0");
  });

const productFields = {
  sku: z.string().trim().max(64).optional().or(z.literal("")),
  price: priceField,
  stock: z.coerce.number().int().min(0, "Stock cannot be negative.").default(0),
};

const serviceFields = {
  pricingType: z.enum(["FIXED", "QUOTE"]).default("FIXED"),
  price: priceField.optional(),
};

const projectFields = {
  price: priceField,
};

export const createProductSchema = z.object({ ...baseListingFields, ...productFields });
export const createServiceSchema = z
  .object({ ...baseListingFields, ...serviceFields })
  .refine((data) => data.pricingType === "QUOTE" || data.price !== undefined, {
    message: "Enter a price, or switch to Quote pricing.",
    path: ["price"],
  });
export const createProjectSchema = z.object({ ...baseListingFields, ...projectFields });

export type CreateProductInput = z.infer<typeof createProductSchema>;
export type CreateServiceInput = z.infer<typeof createServiceSchema>;
export type CreateProjectInput = z.infer<typeof createProjectSchema>;

/** Returns the right schema for a given kind — the one branch point every caller goes through. */
export function getListingSchema(kind: CatalogKind) {
  switch (kind) {
    case "PRODUCT":
      return createProductSchema;
    case "SERVICE":
      return createServiceSchema;
    case "PROJECT":
      return createProjectSchema;
  }
}

export function generateSlug(title: string, disambiguator?: string): string {
  const base = slugify(title);
  return disambiguator ? `${base}-${disambiguator}` : base;
}

export { slugPattern };

export const updateListingStatusSchema = z
  .object({
    kind: catalogKindSchema,
    id: z.string().uuid(),
    action: z.enum(["approve", "reject", "activate", "deactivate", "resubmit"]),
    reason: z.string().trim().max(500).optional(),
  })
  .refine((data) => data.action !== "reject" || !!data.reason?.length, {
    message: "A reason is required when rejecting a listing.",
    path: ["reason"],
  });
export type UpdateListingStatusInput = z.infer<typeof updateListingStatusSchema>;

export const catalogListQuerySchema = z.object({
  search: z.string().trim().max(200).optional(),
  categoryId: z.string().uuid().optional(),
  subcategoryId: z.string().uuid().optional(),
  approvalStatus: z.enum(["PENDING", "APPROVED", "REJECTED"]).optional(),
  isActive: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  sortBy: z.enum(["createdAt", "title", "price"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type CatalogListQueryInput = z.infer<typeof catalogListQuerySchema>;

export const uploadImageSchema = z.object({
  kind: catalogKindSchema,
  itemId: z.string().uuid(),
});

export const deleteImageSchema = z.object({
  kind: catalogKindSchema,
  imageId: z.string().uuid(),
});
