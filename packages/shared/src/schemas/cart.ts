import { z } from "zod";

import { MoneySchema } from "./common";

export const MAX_CART_ITEM_QUANTITY = 10;

export const CartItemSchema = z.object({
  id: z.uuid(),
  product_id: z.uuid(),
  variant_id: z.uuid().nullable(),
  quantity: z.number().int().min(1).max(MAX_CART_ITEM_QUANTITY),
  /** Precio al momento de agregar; se revalida contra la tienda antes de derivar. */
  price_snapshot: MoneySchema,
  added_at: z.iso.datetime({ offset: true }),
});
export type CartItem = z.infer<typeof CartItemSchema>;

/** Carrito externo: lista de productos que deriva a cada tienda original. */
export const CartSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  items: z.array(CartItemSchema),
});
export type Cart = z.infer<typeof CartSchema>;
