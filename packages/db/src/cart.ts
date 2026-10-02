import {
  AppError,
  type CartLine,
  compareSizes,
  type Garment,
  type GarmentSlot,
  GarmentSlotSchema,
  isProductStale,
  listLookGarments,
  type Money,
  pickVariantForSize,
  priceForSize,
  type ProductAvailability,
  type ProductCategory,
  sizeForCategory,
  StoredLookSpecSchema,
} from "@asesor/shared";

import { requirePremium } from "./auth";
import { getUserSizes } from "./profile-sizes";
import { getLookProducts } from "./shopping";
import { NO_PRICE, type ProductRefreshOutcome } from "./shopping-jobs";
import type { TypedSupabaseClient } from "./types";

/**
 * Carrito (paso 10a, D18). No procesa la compra: agrupa productos externos por look y prenda.
 * Todo pasa por el cliente del usuario (RLS: dueño y Premium), y el precio lo fija la base
 * (trigger) al agregar y al cambiar el producto o el talle; nunca el cliente. Las server
 * actions son capas finas sobre esto (D22).
 */

/** Mensajes de `VALIDATION_FAILED` del carrito: la web los traduce a texto humano. */
export const PRODUCT_GONE = "PRODUCT_GONE";
export const VARIANT_GONE = "VARIANT_GONE";
export const ALREADY_IN_CART = "ALREADY_IN_CART";
export const NO_LOOK = "NO_LOOK";

/**
 * Revalida un producto antes de agregarlo (lo hace el worker: `waitForProductRefresh`). Se
 * inyecta para poder probar cada resultado sin tiendas reales.
 */
export type RevalidateProduct = (productId: string) => Promise<ProductRefreshOutcome>;

/**
 * Cómo quedó el dato del producto al agregarlo: `fresh` (verificado hace menos de 8 h),
 * `verified` (se revalidó ahora), `unverified` (la tienda no respondió) o `pending` (no
 * terminó a tiempo). En los dos últimos el stock se informa como `UNKNOWN`.
 */
export type CartRevalidation = "fresh" | "verified" | "unverified" | "pending";

export interface CartChangeResult {
  itemId: string;
  productId: string;
  storeDomain: string;
  lookId: string | null;
  slot: GarmentSlot | null;
  variantId: string | null;
  /** Precio del ítem, fijado por la base. */
  price: Money;
  /** El precio cambió con esta operación (revalidación, otro talle o un ítem que ya estaba). */
  priceChange: { from: Money; to: Money } | null;
  /**
   * Precio del producto que se mostraba en los resultados (el menor de sus variantes). Si el
   * talle elegido cuesta otra cosa (otro color, otra variante), la UI lo avisa. null al cambiar
   * el talle a mano.
   */
  listedPrice: Money | null;
  /** Talle y color de la variante elegida (null: sin talle). */
  variant: { size: string | null; color: string | null } | null;
  revalidation: CartRevalidation;
  availability: ProductAvailability;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const invalid = () => new AppError("VALIDATION_FAILED", "Pedido inválido.");

function fail(message: string, cause: unknown): never {
  throw new AppError("INTERNAL", message, { cause });
}

function sameMoney(a: Money, b: Money): boolean {
  return a.currency === b.currency && Math.round(a.amount * 100) === Math.round(b.amount * 100);
}

const change = (from: Money | null, to: Money) =>
  from && !sameMoney(from, to) ? { from, to } : null;

// --- Lecturas --------------------------------------------------------------------------

interface CatalogVariant {
  id: string;
  size: string | null;
  color: string | null;
  availability: ProductAvailability;
  price_amount: number | null;
  currency: Money["currency"] | null;
}

interface CatalogProduct {
  id: string;
  store_domain: string;
  category: ProductCategory;
  price_amount: number | null;
  currency: Money["currency"] | null;
  availability: ProductAvailability;
  last_fetched_at: string;
  product_variants: CatalogVariant[];
}

async function readProduct(
  client: TypedSupabaseClient,
  productId: string,
): Promise<CatalogProduct | null> {
  const { data, error } = await client
    .from("products")
    .select(
      "id, store_domain, category, price_amount, currency, availability, last_fetched_at, product_variants (id, size, color, availability, price_amount, currency)",
    )
    .eq("id", productId)
    .maybeSingle();
  if (error) fail("No se pudo leer el producto.", error);
  return data;
}

/** El precio que fija el trigger: el de la variante o, si no tiene, el del producto. */
function catalogPrice(product: CatalogProduct, variantId: string | null): Money | null {
  const variant = variantId ? product.product_variants.find((v) => v.id === variantId) : null;
  const amount = variant?.price_amount ?? product.price_amount;
  const currency = variant?.currency ?? product.currency;
  return amount === null || currency === null ? null : { amount: Number(amount), currency };
}

/**
 * Lo que se mostraba en los resultados: el precio del talle con que se buscó la prenda
 * (`priceForSize`, la misma regla que la vista) o, sin talle, el del producto.
 */
function listed(product: CatalogProduct, searchedSize: string | null): Money | null {
  const base =
    product.price_amount === null || product.currency === null
      ? null
      : { amount: Number(product.price_amount), currency: product.currency };
  const variants = product.product_variants.map((v) => {
    const currency = v.currency ?? base?.currency ?? null;
    return {
      size: v.size,
      availability: v.availability,
      price:
        v.price_amount === null || currency === null
          ? null
          : { amount: Number(v.price_amount), currency },
    };
  });
  return priceForSize(base, variants, searchedSize);
}

function variantInfo(product: CatalogProduct, variantId: string | null) {
  const variant = variantId ? product.product_variants.find((v) => v.id === variantId) : null;
  return variant ? { size: variant.size, color: variant.color } : null;
}

function availabilityOf(
  product: CatalogProduct,
  variantId: string | null,
  revalidation: CartRevalidation,
): ProductAvailability {
  // Sin verificación de hoy no se sostiene el stock viejo como cierto.
  if (revalidation === "pending" || revalidation === "unverified") return "UNKNOWN";
  const variant = variantId ? product.product_variants.find((v) => v.id === variantId) : null;
  return variant?.availability ?? product.availability;
}

/**
 * Producto listo para el carrito: si el dato tiene más de 8 h, se revalida antes (SPEC
 * "CACHE"). Devuelve el producto como estaba antes y después.
 */
async function loadFresh(
  client: TypedSupabaseClient,
  productId: string,
  revalidate: RevalidateProduct,
  now: Date,
): Promise<{ before: CatalogProduct; product: CatalogProduct; revalidation: CartRevalidation }> {
  const before = await readProduct(client, productId);
  if (!before) throw new AppError("NOT_FOUND", "Producto inexistente.");
  if (!isProductStale(before.last_fetched_at, now)) {
    return { before, product: before, revalidation: "fresh" };
  }
  const outcome = await revalidate(productId);
  if (outcome === "gone") throw new AppError("VALIDATION_FAILED", PRODUCT_GONE);
  const product = (await readProduct(client, productId)) ?? before;
  // Un "verified" cuenta si el producto quedó fresco: el job de esta hora pudo terminar antes
  // de que el dato volviera a quedar viejo.
  const revalidation =
    outcome === "pending"
      ? "pending"
      : outcome === "verified" && !isProductStale(product.last_fetched_at, now)
        ? "verified"
        : "unverified";
  return { before, product, revalidation };
}

const ITEM_COLUMNS =
  "id, cart_id, product_id, variant_id, look_id, garment_slot, price_amount_snapshot, currency_snapshot, purchased_at";

interface ItemRow {
  id: string;
  cart_id: string;
  product_id: string;
  variant_id: string | null;
  look_id: string | null;
  garment_slot: string | null;
  price_amount_snapshot: number;
  currency_snapshot: Money["currency"];
  purchased_at: string | null;
}

const itemPrice = (item: ItemRow): Money => ({
  amount: Number(item.price_amount_snapshot),
  currency: item.currency_snapshot,
});

const slotOf = (item: Pick<ItemRow, "garment_slot">): GarmentSlot | null =>
  GarmentSlotSchema.safeParse(item.garment_slot).data ?? null;

async function readItem(client: TypedSupabaseClient, itemId: string): Promise<ItemRow> {
  if (!UUID.test(itemId)) throw invalid();
  const { data, error } = await client
    .from("cart_items")
    .select(ITEM_COLUMNS)
    .eq("id", itemId)
    .maybeSingle();
  if (error) fail("No se pudo leer el carrito.", error);
  if (!data) throw new AppError("NOT_FOUND", "Ese producto ya no está en tu carrito.");
  return data;
}

/**
 * Resultado de la prenda de un look para ese producto (ranking principal o "más baratas").
 * Con el cliente del usuario: la RLS de `look_products` exige dueño Premium. Devuelve el
 * talle con el que se buscó, para elegir la variante.
 */
async function lookResult(
  client: TypedSupabaseClient,
  input: { lookId: string; slot: GarmentSlot; productId: string },
): Promise<{ userSize: string | null; garment: Garment | null }> {
  const [result, look] = await Promise.all([
    client
      .from("look_products")
      .select("user_size")
      .eq("look_id", input.lookId)
      .eq("garment_slot", input.slot)
      .eq("product_id", input.productId)
      .limit(1)
      .maybeSingle(),
    client.from("looks").select("spec_json").eq("id", input.lookId).maybeSingle(),
  ]);
  if (result.error) fail("No se pudieron leer los resultados del look.", result.error);
  if (!result.data) throw new AppError("NOT_FOUND", "Ese producto no está en el look.");
  // La prenda del look, para elegir la variante de su color (paso 12b). Sin ella, solo talle.
  const spec = look.data ? StoredLookSpecSchema.safeParse(look.data.spec_json) : null;
  const garment = spec?.success
    ? (listLookGarments(spec.data).find((g) => g.slot === input.slot)?.garment ?? null)
    : null;
  return { userSize: result.data.user_size, garment };
}

/**
 * Talle para elegir la variante: el del perfil del usuario para esa categoría (lo que pide el
 * SPEC) o, si no lo cargó, el talle con el que se buscó la prenda.
 */
async function preferredSize(
  client: TypedSupabaseClient,
  userId: string,
  product: CatalogProduct,
  searched: string | null,
): Promise<string | null> {
  const sizes = await getUserSizes(client, userId);
  return sizeForCategory(sizes, product.category) ?? searched;
}

type PgError = { code?: string } | null;
const isCode = (error: PgError, code: string) => error?.code === code;

// --- Carrito -----------------------------------------------------------------------------

/**
 * Carrito del usuario; lo crea si no existe. Dos pedidos a la vez no chocan: el segundo
 * insert no hace nada (único de `user_id`) y los dos leen el mismo carrito.
 */
export async function getOrCreateCart(
  client: TypedSupabaseClient,
  userId: string,
): Promise<string> {
  const existing = await client.from("carts").select("id").eq("user_id", userId).maybeSingle();
  if (existing.error) fail("No se pudo leer el carrito.", existing.error);
  if (existing.data) return existing.data.id;
  const created = await client
    .from("carts")
    .upsert({ user_id: userId }, { onConflict: "user_id", ignoreDuplicates: true });
  if (created.error) {
    if (isCode(created.error, "42501")) {
      throw new AppError("PREMIUM_REQUIRED", "Esta función es Premium.");
    }
    fail("No se pudo crear el carrito.", created.error);
  }
  const cart = await client.from("carts").select("id").eq("user_id", userId).single();
  if (cart.error || !cart.data) fail("No se pudo leer el carrito.", cart.error);
  return cart.data.id;
}

export interface AddToCartInput {
  userClient: TypedSupabaseClient;
  productId: string;
  /** Talle elegido. Sin talle, se elige el del usuario si la prenda del look lo tiene. */
  variantId?: string | null;
  /** Look y prenda del resultado (van juntos). Sin look: producto suelto (p. ej., guardado). */
  lookId?: string | null;
  slot?: string | null;
  revalidate: RevalidateProduct;
  now?: Date;
}

export interface AddToCartResult extends CartChangeResult {
  cartId: string;
  /** Ya estaba (mismo producto, talle, look y prenda): no se duplica; se actualiza su precio. */
  alreadyInCart: boolean;
}

/**
 * Agrega un producto al carrito. Verifica Premium, que el producto sea un resultado de esa
 * prenda del look (si viene look) y lo revalida si el dato tiene más de 8 h; avisa si el
 * precio cambió. Un producto sin precio (local físico) no entra. Errores: AUTH_REQUIRED,
 * PREMIUM_REQUIRED, NOT_FOUND y VALIDATION_FAILED (`NO_PRICE`, `PRODUCT_GONE`,
 * `VARIANT_GONE` o pedido inválido).
 */
export async function addToCart(input: AddToCartInput): Promise<AddToCartResult> {
  const now = input.now ?? new Date();
  const client = input.userClient;
  const user = await requirePremium(client, now);
  const lookId = input.lookId ?? null;
  const slot = input.slot ? (GarmentSlotSchema.safeParse(input.slot).data ?? null) : null;
  const variantInput = input.variantId ?? null;
  if (
    !UUID.test(input.productId) ||
    (variantInput !== null && !UUID.test(variantInput)) ||
    (lookId !== null && !UUID.test(lookId)) ||
    (input.slot && !slot) ||
    (lookId === null) !== (slot === null)
  ) {
    throw invalid();
  }

  const result =
    lookId && slot
      ? await lookResult(client, { lookId, slot, productId: input.productId })
      : { userSize: null, garment: null };
  const { before, product, revalidation } = await loadFresh(
    client,
    input.productId,
    input.revalidate,
    now,
  );

  let variantId = variantInput;
  if (variantId !== null && !product.product_variants.some((v) => v.id === variantId)) {
    throw new AppError("VALIDATION_FAILED", VARIANT_GONE);
  }
  variantId ??=
    pickVariantForSize(
      product.product_variants,
      await preferredSize(client, user.id, product, result.userSize),
      result.garment,
    )?.id ?? null;
  if (!catalogPrice(product, variantId)) throw new AppError("VALIDATION_FAILED", NO_PRICE);

  const cartId = await getOrCreateCart(client, user.id);
  const inserted = await client
    .from("cart_items")
    .insert({
      cart_id: cartId,
      product_id: input.productId,
      variant_id: variantId,
      look_id: lookId,
      garment_slot: slot,
    })
    .select(ITEM_COLUMNS)
    .single();

  let item: ItemRow;
  let previous: Money | null = catalogPrice(before, variantId);
  let alreadyInCart = false;
  if (!inserted.error && inserted.data) {
    item = inserted.data;
  } else if (isCode(inserted.error, "23505")) {
    // Ya estaba: se reusa el ítem y se actualiza su precio (el trigger lo vuelve a fijar).
    let query = client
      .from("cart_items")
      .select(ITEM_COLUMNS)
      .eq("cart_id", cartId)
      .eq("product_id", input.productId);
    query = variantId ? query.eq("variant_id", variantId) : query.is("variant_id", null);
    query =
      lookId && slot
        ? query.eq("look_id", lookId).eq("garment_slot", slot)
        : query.is("look_id", null).is("garment_slot", null);
    const existing = await query.maybeSingle();
    if (existing.error || !existing.data) fail("No se pudo leer el carrito.", existing.error);
    previous = itemPrice(existing.data);
    const refreshed = await client
      .from("cart_items")
      .update({ variant_id: existing.data.variant_id })
      .eq("id", existing.data.id)
      .select(ITEM_COLUMNS)
      .single();
    item = refreshed.data ?? existing.data;
    alreadyInCart = true;
  } else if (isCode(inserted.error, "22023")) {
    throw new AppError("VALIDATION_FAILED", NO_PRICE);
  } else if (isCode(inserted.error, "42501")) {
    throw new AppError("PREMIUM_REQUIRED", "Esta función es Premium.");
  } else {
    fail("No se pudo agregar al carrito.", inserted.error);
  }

  const price = itemPrice(item);
  return {
    cartId,
    alreadyInCart,
    itemId: item.id,
    productId: item.product_id,
    storeDomain: product.store_domain,
    lookId: item.look_id,
    slot: slotOf(item),
    variantId: item.variant_id,
    price,
    priceChange: change(previous, price),
    listedPrice: listed(before, result.userSize),
    variant: variantInfo(product, item.variant_id),
    revalidation,
    availability: availabilityOf(product, item.variant_id, revalidation),
  };
}

/**
 * Elige (o cambia) el talle de un ítem. El trigger vuelve a fijar el precio con el de la
 * variante. Errores: NOT_FOUND (ítem ajeno o inexistente) y VALIDATION_FAILED
 * (`VARIANT_GONE`, `ALREADY_IN_CART` si ese talle ya está en la misma prenda).
 */
export async function selectCartItemVariant(input: {
  userClient: TypedSupabaseClient;
  itemId: string;
  variantId: string | null;
  now?: Date;
}): Promise<CartChangeResult> {
  const client = input.userClient;
  await requirePremium(client, input.now);
  if (input.variantId !== null && !UUID.test(input.variantId)) throw invalid();
  const item = await readItem(client, input.itemId);
  const product = await readProduct(client, item.product_id);
  if (!product) throw new AppError("NOT_FOUND", "Producto inexistente.");
  if (input.variantId && !product.product_variants.some((v) => v.id === input.variantId)) {
    throw new AppError("VALIDATION_FAILED", VARIANT_GONE);
  }

  const { data, error } = await client
    .from("cart_items")
    .update({ variant_id: input.variantId })
    .eq("id", item.id)
    .select(ITEM_COLUMNS)
    .single();
  if (isCode(error, "23505")) throw new AppError("VALIDATION_FAILED", ALREADY_IN_CART);
  if (error || !data) fail("No se pudo cambiar el talle.", error);
  const price = itemPrice(data);
  // Cambiar el talle no consulta la tienda: un dato viejo queda sin verificar.
  const revalidation = isProductStale(product.last_fetched_at, input.now) ? "unverified" : "fresh";
  return {
    itemId: data.id,
    productId: data.product_id,
    storeDomain: product.store_domain,
    lookId: data.look_id,
    slot: slotOf(data),
    variantId: data.variant_id,
    price,
    priceChange: change(itemPrice(item), price),
    listedPrice: null,
    variant: variantInfo(product, data.variant_id),
    revalidation,
    availability: availabilityOf(product, data.variant_id, revalidation),
  };
}

/**
 * Cambia un ítem por otra alternativa de la misma prenda del look (ranking principal o "más
 * baratas"). La alternativa se revalida como al agregarla y toma el talle del usuario. Si ya
 * estaba en el carrito para esa prenda, los dos ítems se juntan en uno. Errores: los de
 * `addToCart` y VALIDATION_FAILED `NO_LOOK` (el ítem no tiene look: no hay alternativas).
 */
export async function swapCartItem(input: {
  userClient: TypedSupabaseClient;
  itemId: string;
  productId: string;
  revalidate: RevalidateProduct;
  now?: Date;
}): Promise<CartChangeResult & { previousProductId: string; merged: boolean }> {
  const now = input.now ?? new Date();
  const client = input.userClient;
  const user = await requirePremium(client, now);
  if (!UUID.test(input.productId)) throw invalid();
  const item = await readItem(client, input.itemId);
  const slot = slotOf(item);
  if (!item.look_id || !slot) throw new AppError("VALIDATION_FAILED", NO_LOOK);
  if (input.productId === item.product_id) {
    const current = await readProduct(client, item.product_id);
    if (!current) throw new AppError("NOT_FOUND", "Producto inexistente.");
    const unchanged = isProductStale(current.last_fetched_at, now) ? "unverified" : "fresh";
    return {
      itemId: item.id,
      productId: item.product_id,
      previousProductId: item.product_id,
      storeDomain: current.store_domain,
      lookId: item.look_id,
      slot,
      variantId: item.variant_id,
      price: itemPrice(item),
      priceChange: null,
      listedPrice: null,
      variant: variantInfo(current, item.variant_id),
      revalidation: unchanged,
      availability: availabilityOf(current, item.variant_id, unchanged),
      merged: false,
    };
  }

  const result = await lookResult(client, {
    lookId: item.look_id,
    slot,
    productId: input.productId,
  });
  const { before, product, revalidation } = await loadFresh(
    client,
    input.productId,
    input.revalidate,
    now,
  );
  // El talle: el del perfil (o el de la búsqueda) y, si no hay, el que tenía el ítem.
  const oldVariant = item.variant_id
    ? (await readProduct(client, item.product_id))?.product_variants.find(
        (v) => v.id === item.variant_id,
      )
    : undefined;
  const size =
    (await preferredSize(client, user.id, product, result.userSize)) ?? oldVariant?.size ?? null;
  const variantId = pickVariantForSize(product.product_variants, size, result.garment)?.id ?? null;
  if (!catalogPrice(product, variantId)) throw new AppError("VALIDATION_FAILED", NO_PRICE);

  const updated = await client
    .from("cart_items")
    .update({ product_id: input.productId, variant_id: variantId })
    .eq("id", item.id)
    .select(ITEM_COLUMNS)
    .single();
  let next: ItemRow;
  let merged = false;
  if (!updated.error && updated.data) {
    next = updated.data;
  } else if (isCode(updated.error, "23505")) {
    // La alternativa ya estaba en esa prenda: queda una sola.
    let query = client
      .from("cart_items")
      .select(ITEM_COLUMNS)
      .eq("cart_id", item.cart_id)
      .eq("look_id", item.look_id)
      .eq("garment_slot", slot)
      .eq("product_id", input.productId);
    query = variantId ? query.eq("variant_id", variantId) : query.is("variant_id", null);
    const existing = await query.maybeSingle();
    if (existing.error || !existing.data) fail("No se pudo leer el carrito.", existing.error);
    const removed = await client.from("cart_items").delete().eq("id", item.id);
    if (removed.error) fail("No se pudo cambiar el producto.", removed.error);
    next = existing.data;
    merged = true;
  } else if (isCode(updated.error, "22023")) {
    throw new AppError("VALIDATION_FAILED", NO_PRICE);
  } else {
    fail("No se pudo cambiar el producto.", updated.error);
  }

  const price = itemPrice(next);
  return {
    previousProductId: item.product_id,
    storeDomain: product.store_domain,
    lookId: item.look_id,
    slot,
    revalidation,
    itemId: next.id,
    productId: next.product_id,
    variantId: next.variant_id,
    price,
    priceChange: change(catalogPrice(before, variantId), price),
    listedPrice: listed(before, result.userSize),
    variant: variantInfo(product, next.variant_id),
    availability: availabilityOf(product, next.variant_id, revalidation),
    merged,
  };
}

/** Saca un ítem del carrito. NOT_FOUND si no es del usuario o ya no está. */
export async function removeFromCart(input: {
  userClient: TypedSupabaseClient;
  itemId: string;
  now?: Date;
}): Promise<{
  itemId: string;
  productId: string;
  lookId: string | null;
  slot: GarmentSlot | null;
}> {
  const client = input.userClient;
  await requirePremium(client, input.now);
  const item = await readItem(client, input.itemId);
  const { data, error } = await client.from("cart_items").delete().eq("id", item.id).select("id");
  if (error) fail("No se pudo sacar del carrito.", error);
  if (!data || data.length === 0) {
    throw new AppError("NOT_FOUND", "Ese producto ya no está en tu carrito.");
  }
  return { itemId: item.id, productId: item.product_id, lookId: item.look_id, slot: slotOf(item) };
}

/** Marca (o desmarca) un ítem como comprado en la tienda. Solo el dueño Premium. */
export async function setCartItemPurchased(input: {
  userClient: TypedSupabaseClient;
  itemId: string;
  purchased: boolean;
  now?: Date;
}): Promise<{ itemId: string; productId: string; purchasedAt: string | null }> {
  const now = input.now ?? new Date();
  const client = input.userClient;
  await requirePremium(client, now);
  if (!UUID.test(input.itemId)) throw invalid();
  const { data, error } = await client
    .from("cart_items")
    .update({ purchased_at: input.purchased ? now.toISOString() : null })
    .eq("id", input.itemId)
    .select("id, product_id, purchased_at");
  if (error) fail("No se pudo actualizar el carrito.", error);
  const [row] = data ?? [];
  if (!row) throw new AppError("NOT_FOUND", "Ese producto ya no está en tu carrito.");
  return { itemId: row.id, productId: row.product_id, purchasedAt: row.purchased_at };
}

const LINE_COLUMNS = `id, quantity, price_amount_snapshot, currency_snapshot, look_id, garment_slot, purchased_at, created_at,
  products (id, title, store_name, store_domain, url, image_url, price_amount, currency, availability, last_fetched_at,
    product_variants (id, size, color, availability)),
  product_variants (id, size, color, availability, price_amount, currency),
  looks (id, name, position)`;

/**
 * Ítems del carrito con los datos actuales del catálogo, para `buildCartView`. Con el cliente
 * del usuario: la RLS solo devuelve los suyos. El look de un ítem puede no leerse (un look
 * Premium de alguien que dejó de serlo): el ítem conserva el id y queda sin nombre.
 */
export async function getCartLines(client: TypedSupabaseClient): Promise<CartLine[]> {
  const { data, error } = await client
    .from("cart_items")
    .select(LINE_COLUMNS)
    .order("created_at", { ascending: true });
  if (error) fail("No se pudo leer el carrito.", error);
  return (data ?? []).flatMap((row) => {
    const product = row.products;
    if (!product) return [];
    const variant = row.product_variants;
    const amount = variant?.price_amount ?? product.price_amount;
    const currency = variant?.currency ?? product.currency;
    return [
      {
        id: row.id,
        productId: product.id,
        title: product.title,
        storeName: product.store_name,
        storeDomain: product.store_domain,
        url: product.url,
        imageUrl: product.image_url,
        look: row.look_id
          ? {
              id: row.look_id,
              name: row.looks?.name ?? null,
              position: row.looks?.position ?? null,
            }
          : null,
        slot: slotOf(row),
        variant: variant ? { id: variant.id, size: variant.size, color: variant.color } : null,
        variants: product.product_variants
          .filter((v) => v.size)
          .sort(
            (a, b) =>
              compareSizes(a.size!, b.size!) || (a.color ?? "").localeCompare(b.color ?? ""),
          )
          .map((v) => ({
            id: v.id,
            size: v.size!,
            color: v.color,
            availability: v.availability,
          })),
        quantity: row.quantity,
        snapshot: { amount: Number(row.price_amount_snapshot), currency: row.currency_snapshot },
        current: amount === null || currency === null ? null : { amount: Number(amount), currency },
        availability: variant?.availability ?? product.availability,
        fetchedAt: new Date(product.last_fetched_at).toISOString(),
        purchasedAt: row.purchased_at,
        addedAt: new Date(row.created_at).toISOString(),
      },
    ];
  });
}

export interface AddLookToCartResult {
  /** Prendas agregadas (o que ya estaban), con su resultado. */
  added: AddToCartResult[];
  /** Prendas que ya tenían algo en el carrito (el recomendado u otra opción que se eligió). */
  present: Array<{ slot: GarmentSlot; productId: string }>;
  /** Prendas que no entraron y por qué (`NO_PRICE`, `PRODUCT_GONE`, …). */
  skipped: Array<{ slot: GarmentSlot; productId: string; reason: string }>;
}

/**
 * "Agregar el look al carrito": el RECOMENDADO de cada prenda con resultados que todavía no
 * tiene nada en el carrito, en paralelo (las revalidaciones corren juntas en el worker). Una
 * prenda que no entra (local físico sin precio, producto que la tienda sacó) no frena a las
 * demás. Errores: AUTH_REQUIRED,
 * PREMIUM_REQUIRED y NOT_FOUND (look sin resultados o ajeno).
 */
export async function addLookToCart(input: {
  userClient: TypedSupabaseClient;
  lookId: string;
  revalidate: RevalidateProduct;
  now?: Date;
}): Promise<AddLookToCartResult> {
  const client = input.userClient;
  await requirePremium(client, input.now);
  if (!UUID.test(input.lookId)) throw invalid();
  const all = (await getLookProducts(client, input.lookId)).filter(
    (row) => row.list === "MAIN" && row.rank === 1,
  );
  if (all.length === 0) throw new AppError("NOT_FOUND", "El look no tiene resultados.");
  // Completa las prendas vacías: si una prenda ya tiene algo en el carrito (el recomendado en
  // otro talle u otra opción que el usuario eligió), no se agrega el recomendado encima.
  const { data: inCart, error } = await client
    .from("cart_items")
    .select("garment_slot")
    .eq("look_id", input.lookId);
  if (error) fail("No se pudo leer el carrito.", error);
  const covered = new Set((inCart ?? []).map((i) => i.garment_slot));
  const recommended = all.filter((row) => !covered.has(row.slot));

  const outcomes = await Promise.allSettled(
    recommended.map((row) =>
      addToCart({
        userClient: client,
        productId: row.product.id,
        lookId: input.lookId,
        slot: row.slot,
        revalidate: input.revalidate,
        now: input.now,
      }),
    ),
  );
  const result: AddLookToCartResult = {
    added: [],
    present: all
      .filter((row) => covered.has(row.slot))
      .map((row) => ({ slot: row.slot, productId: row.product.id })),
    skipped: [],
  };
  outcomes.forEach((outcome, i) => {
    const row = recommended[i]!;
    if (outcome.status === "fulfilled") {
      result.added.push(outcome.value);
      return;
    }
    const error: unknown = outcome.reason;
    // Fallas de una prenda (sin precio, sin publicar): se informan; las otras siguen.
    if (error instanceof AppError && error.code === "VALIDATION_FAILED") {
      result.skipped.push({ slot: row.slot, productId: row.product.id, reason: error.message });
      return;
    }
    throw error;
  });
  return result;
}
