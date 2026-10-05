import { z } from "zod";

/**
 * Cart/checkout/order validation — see docs/database-tables.md §3 and the
 * Phase 5 brief. Shared client+server source of truth, same convention as
 * src/lib/schemas/auth.ts and src/lib/schemas/catalog.ts.
 */

export const catalogItemKindSchema = z.enum(["PRODUCT", "SERVICE", "PROJECT"]);

export const addToCartSchema = z.object({
  itemType: catalogItemKindSchema,
  itemId: z.string().uuid(),
  qty: z.coerce.number().int().min(1).max(999).default(1),
});
export type AddToCartInput = z.infer<typeof addToCartSchema>;

export const updateCartItemSchema = z.object({
  cartItemId: z.string().uuid(),
  qty: z.coerce.number().int().min(1).max(999),
});
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;

export const removeCartItemSchema = z.object({
  cartItemId: z.string().uuid(),
});
export type RemoveCartItemInput = z.infer<typeof removeCartItemSchema>;

export const placeOrderSchema = z.object({
  idempotencyKey: z.string().uuid(),
  couponCode: z
    .string()
    .trim()
    .toUpperCase()
    .max(40)
    .optional()
    .transform((v) => (v ? v : undefined)),
});
export type PlaceOrderInput = z.infer<typeof placeOrderSchema>;

export const orderStatusSchema = z.enum([
  "PLACED",
  "PAID",
  "PROCESSING",
  "SHIPPED",
  "DELIVERED",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
]);

export const updateOrderStatusSchema = z
  .object({
    orderId: z.string().uuid(),
    status: orderStatusSchema,
    reason: z
      .string()
      .trim()
      .max(500)
      .optional()
      .transform((v) => (v ? v : undefined)),
  })
  .refine((data) => data.status !== "CANCELLED" || !!data.reason?.length, {
    message: "A reason is required when cancelling an order.",
    path: ["reason"],
  });
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

export const orderListQuerySchema = z.object({
  status: orderStatusSchema.optional(),
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
