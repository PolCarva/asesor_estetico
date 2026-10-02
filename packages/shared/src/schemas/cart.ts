import { z } from "zod";

import { CurrencySchema } from "./common";
import { GarmentSlotSchema } from "./look-spec";

export const MAX_CART_ITEM_QUANTITY = 10;

const timestamp = z.iso.datetime({ offset: true });

/**
 * Fila de `cart_items` (paso 10a). El precio (`price_amount_snapshot`, `currency_snapshot`)
 * lo fija un trigger desde el catálogo al agregar y al cambiar el producto o el talle; el
 * cliente nunca lo escribe. Con look, la prenda es obligatoria; sin look, el ítem es un
 * producto suelto o quedó de un look que se borró (conserva la prenda como referencia).
 */
export const CartItemSchema = z
  .object({
    id: z.uuid(),
    cart_id: z.uuid(),
    product_id: z.uuid(),
    variant_id: z.uuid().nullable(),
    look_id: z.uuid().nullable(),
    garment_slot: GarmentSlotSchema.nullable(),
    quantity: z.number().int().min(1).max(MAX_CART_ITEM_QUANTITY),
    price_amount_snapshot: z.number().nonnegative(),
    currency_snapshot: CurrencySchema,
    /** Marcado como comprado en la tienda (null: todavía no). */
    purchased_at: timestamp.nullable(),
    created_at: timestamp,
    updated_at: timestamp,
  })
  .refine((item) => item.look_id === null || item.garment_slot !== null, {
    message: "Un ítem con look necesita la prenda",
    path: ["garment_slot"],
  });
export type CartItem = z.infer<typeof CartItemSchema>;

/** Carrito externo: lista de productos que deriva a cada tienda original. */
export const CartSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  items: z.array(CartItemSchema),
});
export type Cart = z.infer<typeof CartSchema>;
