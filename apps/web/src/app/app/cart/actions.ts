"use server";

import {
  addLookToCart,
  addToCart,
  ALREADY_IN_CART,
  type CartChangeResult,
  NO_LOOK,
  NO_PRICE,
  PRODUCT_GONE,
  removeFromCart,
  requirePremium,
  selectCartItemVariant,
  setCartItemPurchased,
  swapCartItem,
  type TypedSupabaseClient,
  VARIANT_GONE,
  waitForProductRefresh,
} from "@asesor/db";
import { createServerSupabaseClient } from "@asesor/db/server";
import { getServiceRoleClient } from "@asesor/db/service";
import { GarmentSlotSchema, isAppError } from "@asesor/shared";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAnalytics } from "@/lib/analytics";
import { cartChangeNotices, lookCartSummary } from "@/lib/cart-notices";
import { getLogger } from "@/lib/logger";
import { enforceRateLimit, rateLimiters } from "@/lib/rate-limit";

/**
 * Carrito (paso 10a, D18). Capas finas (D22): Premium en el servidor (el botón oculto no
 * alcanza), Zod, rate limit, analytics desde acá (D20) y `revalidatePath`; la lógica vive en
 * `@asesor/db` (`addToCart`, `selectCartItemVariant`, `swapCartItem`, `removeFromCart`,
 * `setCartItemPurchased`). Nunca devuelven errores técnicos. Un usuario que dejó de ser
 * Premium recibe `paywall`: su carrito queda en solo lectura.
 */

export type CartActionState =
  | { status: "idle" }
  | { status: "done"; message: string; itemId: string | null; notices: string[] }
  | { status: "paywall" }
  | { status: "error"; error: string };

const MESSAGES: Record<string, string> = {
  [NO_PRICE]:
    "Este producto se consigue en el local y no tiene precio publicado: no se puede sumar al carrito.",
  [PRODUCT_GONE]: "Este producto ya no está publicado en la tienda.",
  [VARIANT_GONE]: "Ese talle ya no está publicado. Elegí otro.",
  [ALREADY_IN_CART]: "Ese talle ya está en tu carrito para esta prenda.",
  [NO_LOOK]: "Este producto no es de un look: no tiene alternativas para cambiarlo.",
  NOT_FOUND: "Ese producto ya no está disponible.",
  RATE_LIMITED: "Hiciste muchos cambios seguidos. Probá de nuevo en un rato.",
  AUTH_REQUIRED: "Tenés que iniciar sesión.",
  VALIDATION_FAILED: "No pudimos procesar el pedido.",
};

const empty = (value: unknown) => (value === "" ? undefined : value);
const OptionalUuid = z.preprocess(empty, z.uuid().optional());

const AddSchema = z
  .object({
    productId: z.uuid(),
    variantId: OptionalUuid,
    lookId: OptionalUuid,
    slot: z.preprocess(empty, GarmentSlotSchema.optional()),
  })
  .refine((d) => (d.lookId === undefined) === (d.slot === undefined));
const ItemSchema = z.object({ itemId: z.uuid() });
const VariantSchema = z.object({ itemId: z.uuid(), variantId: OptionalUuid });
const SwapSchema = z.object({ itemId: z.uuid(), productId: z.uuid() });
const PurchasedSchema = z.object({ itemId: z.uuid(), purchased: z.enum(["true", "false"]) });
const LookSchema = z.object({ lookId: z.uuid() });

/** Revalidación con el worker antes de agregar (la web nunca descarga páginas de tiendas). */
const revalidate = (productId: string) => waitForProductRefresh(getServiceRoleClient(), productId);

function failure(error: unknown, fallback: string): CartActionState {
  if (isAppError(error)) {
    if (error.code === "PREMIUM_REQUIRED") return { status: "paywall" };
    const message = MESSAGES[error.message] ?? MESSAGES[error.code];
    if (message) return { status: "error", error: message };
  }
  getLogger().error("falló una acción del carrito", { error });
  return { status: "error", error: fallback };
}

async function cartAction<T>(
  schema: z.ZodType<T>,
  formData: FormData,
  fallback: string,
  run: (input: {
    supabase: TypedSupabaseClient;
    userId: string;
    data: T;
  }) => Promise<CartActionState>,
): Promise<CartActionState> {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await requirePremium(supabase);
    const parsed = schema.safeParse(Object.fromEntries(formData));
    if (!parsed.success) return { status: "error", error: MESSAGES.VALIDATION_FAILED! };
    await enforceRateLimit(rateLimiters.cart, user.id);
    const state = await run({ supabase, userId: user.id, data: parsed.data });
    // Todo lo de /app: el carrito, el look y el contador del header.
    revalidatePath("/app", "layout");
    return state;
  } catch (error) {
    return failure(error, fallback);
  }
}

function addedEvent(userId: string, result: CartChangeResult, source: "add" | "swap" | "look") {
  return getAnalytics().trackEvent("product_added_to_cart", {
    userId,
    path: "/app/cart",
    properties: {
      product_id: result.productId,
      store_domain: result.storeDomain,
      look_id: result.lookId,
      slot: result.slot,
      price: result.price.amount,
      currency: result.price.currency,
      revalidation: result.revalidation,
      source,
    },
  });
}

/** Agrega un producto (revalidado si el dato tiene más de 8 h) y avisa si cambió el precio. */
export async function addToCartAction(
  _prev: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  return cartAction(
    AddSchema,
    formData,
    "No pudimos agregarlo al carrito. Probá de nuevo.",
    async ({ supabase, userId, data }) => {
      const result = await addToCart({
        userClient: supabase,
        productId: data.productId,
        variantId: data.variantId ?? null,
        lookId: data.lookId ?? null,
        slot: data.slot ?? null,
        revalidate,
      });
      if (!result.alreadyInCart) await addedEvent(userId, result, "add");
      return {
        status: "done",
        message: result.alreadyInCart ? "Ya estaba en tu carrito." : "Agregado al carrito.",
        itemId: result.itemId,
        notices: cartChangeNotices(result),
      };
    },
  );
}

export async function removeFromCartAction(
  _prev: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  return cartAction(
    ItemSchema,
    formData,
    "No pudimos sacarlo del carrito. Probá de nuevo.",
    async ({ supabase, userId, data }) => {
      const removed = await removeFromCart({ userClient: supabase, itemId: data.itemId });
      await getAnalytics().trackEvent("product_removed_from_cart", {
        userId,
        path: "/app/cart",
        properties: {
          product_id: removed.productId,
          look_id: removed.lookId,
          slot: removed.slot,
          source: "remove",
        },
      });
      return { status: "done", message: "Lo sacamos del carrito.", itemId: null, notices: [] };
    },
  );
}

/** Elige el talle (variante) de un ítem; el precio lo vuelve a fijar la base. */
export async function selectCartItemVariantAction(
  _prev: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  return cartAction(
    VariantSchema,
    formData,
    "No pudimos cambiar el talle. Probá de nuevo.",
    async ({ supabase, data }) => {
      const result = await selectCartItemVariant({
        userClient: supabase,
        itemId: data.itemId,
        variantId: data.variantId ?? null,
      });
      return {
        status: "done",
        message: "Talle actualizado.",
        itemId: result.itemId,
        notices: cartChangeNotices(result),
      };
    },
  );
}

/** Cambia un ítem por otra alternativa de la misma prenda del look. */
export async function swapCartItemAction(
  _prev: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  return cartAction(
    SwapSchema,
    formData,
    "No pudimos cambiar el producto. Probá de nuevo.",
    async ({ supabase, userId, data }) => {
      const result = await swapCartItem({
        userClient: supabase,
        itemId: data.itemId,
        productId: data.productId,
        revalidate,
      });
      if (result.previousProductId !== result.productId) {
        await getAnalytics().trackEvent("product_removed_from_cart", {
          userId,
          path: "/app/cart",
          properties: {
            product_id: result.previousProductId,
            look_id: result.lookId,
            slot: result.slot,
            source: "swap",
          },
        });
        if (!result.merged) await addedEvent(userId, result, "swap");
      }
      return {
        status: "done",
        message: "Cambiamos el producto.",
        itemId: result.itemId,
        notices: cartChangeNotices(result),
      };
    },
  );
}

/** Marca (o desmarca) un ítem como comprado en la tienda. */
export async function setCartItemPurchasedAction(
  _prev: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  return cartAction(
    PurchasedSchema,
    formData,
    "No pudimos actualizar el carrito. Probá de nuevo.",
    async ({ supabase, data }) => {
      const purchased = data.purchased === "true";
      const result = await setCartItemPurchased({
        userClient: supabase,
        itemId: data.itemId,
        purchased,
      });
      return {
        status: "done",
        message: purchased ? "Marcado como comprado." : "Lo pasamos a pendientes.",
        itemId: result.itemId,
        notices: [],
      };
    },
  );
}

/**
 * "Agregar el look al carrito": el recomendado de cada prenda (las revalidaciones corren en
 * paralelo). Las que no entran (local físico, producto que la tienda sacó) se informan.
 */
export async function addLookToCartAction(
  _prev: CartActionState,
  formData: FormData,
): Promise<CartActionState> {
  return cartAction(
    LookSchema,
    formData,
    "No pudimos agregar el look al carrito. Probá de nuevo.",
    async ({ supabase, userId, data }) => {
      const result = await addLookToCart({ userClient: supabase, lookId: data.lookId, revalidate });
      await Promise.all(
        result.added.filter((a) => !a.alreadyInCart).map((a) => addedEvent(userId, a, "look")),
      );
      const summary = lookCartSummary(result);
      return { status: "done", message: summary.message, itemId: null, notices: summary.notices };
    },
  );
}
