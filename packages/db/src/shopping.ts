import {
  AppError,
  type GarmentSlot,
  GarmentSlotSchema,
  type Money,
  type Product,
  ProductSchema,
  type ProductVariant,
  type RankedProduct,
  type ScoreBreakdown,
  type ShoppingStats,
  ShoppingStatsSchema,
  type SizeStatus,
  SizeStatusSchema,
} from "@asesor/shared";

import { type Insert, type Row, toJson, type TypedSupabaseClient } from "./types";

/**
 * Persistencia del shopping (paso 05). `products` y `product_variants` son la cache
 * persistente de productos (global, sin datos de usuarios); `look_products` guarda el
 * ranking de cada prenda de un look; `shopping_search_cache`, los pools de búsqueda (24 h).
 * Todo se escribe con service role (worker).
 *
 * Ojo con los ids: `Product.id` es el id externo (de la plataforma o la URL); el uuid de la
 * base es `products.id`. La identidad de un producto es su URL canónica.
 */

/** Producto guardado: uuid de la base + el Product normalizado. */
export interface StoredProduct {
  id: string;
  product: Product;
}

function fail(message: string, cause: unknown): never {
  throw new AppError("INTERNAL", message, { cause });
}

function productRow(product: Product): Insert<"products"> {
  return {
    external_id: product.id,
    store_name: product.store.name,
    store_domain: product.store.domain,
    url: product.url,
    title: product.title,
    brand: product.brand,
    category: product.category,
    description: product.description,
    image_url: product.image_url,
    price_amount: product.price?.amount ?? null,
    currency: product.price?.currency ?? null,
    colors: product.colors,
    materials: product.materials,
    fit: product.fit,
    availability: product.availability,
    data_json: toJson(product),
    // Una revalidación fallida trae el `fetched_at` de antes: la fecha no avanza (paso 04a).
    last_fetched_at: product.fetched_at,
  };
}

/**
 * Guarda variantes por (producto, id externo). Borra solo las que la tienda dejó de
 * publicar; las que siguen conservan su uuid (el carrito las referencia).
 */
export async function upsertVariants(
  db: TypedSupabaseClient,
  items: Array<{ productId: string; variants: ProductVariant[] }>,
): Promise<void> {
  const rows: Insert<"product_variants">[] = items.flatMap(({ productId, variants }) =>
    [...new Map(variants.map((v) => [v.id, v])).values()].map((v) => ({
      product_id: productId,
      external_id: v.id,
      sku: v.sku,
      size: v.size,
      color: v.color,
      availability: v.availability,
      price_amount: v.price?.amount ?? null,
      currency: v.price?.currency ?? null,
    })),
  );
  if (rows.length > 0) {
    const { error } = await db
      .from("product_variants")
      .upsert(rows, { onConflict: "product_id,external_id" });
    if (error) fail("No se pudieron guardar las variantes.", error);
  }

  const productIds = items.map((i) => i.productId);
  if (productIds.length === 0) return;
  const { data: existing, error } = await db
    .from("product_variants")
    .select("id, product_id, external_id")
    .in("product_id", productIds);
  if (error) fail("No se pudieron leer las variantes.", error);
  const keep = new Set(rows.map((r) => `${r.product_id}|${r.external_id}`));
  const stale = (existing ?? [])
    .filter((v) => !keep.has(`${v.product_id}|${v.external_id}`))
    .map((v) => v.id);
  if (stale.length > 0) {
    const removed = await db.from("product_variants").delete().in("id", stale);
    if (removed.error) fail("No se pudieron borrar variantes viejas.", removed.error);
  }
}

/**
 * Guarda productos y sus variantes, idempotente: el objetivo de conflicto es la URL
 * canónica. Devuelve URL → uuid de la base.
 */
export async function upsertProducts(
  db: TypedSupabaseClient,
  products: Product[],
): Promise<Map<string, string>> {
  const unique = [...new Map(products.map((p) => [p.url, p])).values()];
  if (unique.length === 0) return new Map();
  const { data, error } = await db
    .from("products")
    .upsert(unique.map(productRow), { onConflict: "url" })
    .select("id, url");
  if (error || !data) fail("No se pudieron guardar los productos.", error);
  const ids = new Map(data.map((row) => [row.url, row.id]));
  await upsertVariants(
    db,
    unique.flatMap((p) => {
      const productId = ids.get(p.url);
      return productId ? [{ productId, variants: p.variants }] : [];
    }),
  );
  return ids;
}

type ProductRow = Pick<Row<"products">, "id" | "data_json" | "last_fetched_at" | "availability">;

/** Product guardado. La fecha y la disponibilidad salen de las columnas (las que se actualizan). */
function toStored(row: ProductRow): StoredProduct | null {
  const parsed = ProductSchema.safeParse(row.data_json);
  if (!parsed.success) return null;
  const fetchedAt = new Date(row.last_fetched_at).toISOString();
  return {
    id: row.id,
    product: { ...parsed.data, availability: row.availability, fetched_at: fetchedAt },
  };
}

const PRODUCT_COLUMNS = "id, data_json, last_fetched_at, availability";

/** Productos por uuid, en el mismo orden; los que no existen o no validan se omiten. */
export async function getProductsByIds(
  db: TypedSupabaseClient,
  ids: string[],
): Promise<StoredProduct[]> {
  if (ids.length === 0) return [];
  const { data, error } = await db.from("products").select(PRODUCT_COLUMNS).in("id", ids);
  if (error) fail("No se pudieron leer los productos.", error);
  const byId = new Map((data ?? []).map((row) => [row.id, toStored(row)]));
  return ids.flatMap((id) => {
    const stored = byId.get(id);
    return stored ? [stored] : [];
  });
}

export async function getProductById(
  db: TypedSupabaseClient,
  id: string,
): Promise<StoredProduct | null> {
  const [stored] = await getProductsByIds(db, [id]);
  return stored ?? null;
}

/** Revalidación exitosa: datos nuevos, variantes y `last_fetched_at` = `fetched_at` nuevo. */
export async function markProductVerified(
  db: TypedSupabaseClient,
  id: string,
  product: Product,
): Promise<void> {
  const { error } = await db.from("products").update(productRow(product)).eq("id", id);
  if (error) fail("No se pudo actualizar el producto.", error);
  await upsertVariants(db, [{ productId: id, variants: product.variants }]);
}

/**
 * Revalidación fallida: el stock del producto y de cada talle pasa a UNKNOWN (no se sostienen
 * datos viejos como ciertos) y `last_fetched_at` queda como estaba (una falla no es una
 * verificación).
 */
export async function markProductUnverified(db: TypedSupabaseClient, id: string): Promise<void> {
  const stored = await getProductById(db, id);
  if (!stored) return;
  // Tampoco el stock de cada talle: si no, el ranking seguiría diciendo "tu talle en stock".
  const product = {
    ...stored.product,
    availability: "UNKNOWN" as const,
    variants: stored.product.variants.map((v) => ({ ...v, availability: "UNKNOWN" as const })),
  };
  const { error } = await db
    .from("products")
    .update({ availability: "UNKNOWN", data_json: toJson(product) })
    .eq("id", id);
  if (error) fail("No se pudo actualizar el producto.", error);
  const variants = await db
    .from("product_variants")
    .update({ availability: "UNKNOWN" })
    .eq("product_id", id);
  if (variants.error) fail("No se pudieron actualizar los talles.", variants.error);
}

// --- Ranking por look ------------------------------------------------------------------

/**
 * Guarda el ranking de una prenda de un look: upsert de los productos y reemplazo atómico
 * de `look_products` (función SQL). Idempotente.
 */
export async function saveLookProducts(
  db: TypedSupabaseClient,
  input: {
    lookId: string;
    slot: GarmentSlot;
    items: RankedProduct[];
    /** Talle del usuario con el que se rankeó (al que se refiere `size_status`). */
    userSize?: string | null;
  },
): Promise<number> {
  const ids = await upsertProducts(
    db,
    input.items.map((i) => i.product),
  );
  const items = input.items.flatMap((item) => {
    const productId = ids.get(item.product.url);
    return productId
      ? [
          {
            product_id: productId,
            score: item.score,
            score_breakdown: item.breakdown,
            size_status: item.size_status,
            user_size: input.userSize ?? null,
          },
        ]
      : [];
  });
  const { data, error } = await db.rpc("replace_look_products", {
    p_look_id: input.lookId,
    p_slot: input.slot,
    p_items: toJson(items),
  });
  if (error) fail("No se pudo guardar el ranking del look.", error);
  return data ?? 0;
}

/**
 * "Buscar más barato" (paso 09, D17): guarda las alternativas más baratas que un producto
 * como la lista CHEAPER de la prenda, sin tocar el ranking principal. Reemplaza la lista
 * anterior de esa prenda y no repite productos del ranking principal (función SQL).
 */
export async function saveCheaperProducts(
  db: TypedSupabaseClient,
  input: {
    lookId: string;
    slot: GarmentSlot;
    referenceProductId: string;
    maxPrice: Money;
    items: RankedProduct[];
    userSize?: string | null;
  },
): Promise<number> {
  const ids = await upsertProducts(
    db,
    input.items.map((i) => i.product),
  );
  const items = input.items.flatMap((item) => {
    const productId = ids.get(item.product.url);
    return productId
      ? [
          {
            product_id: productId,
            score: item.score,
            score_breakdown: item.breakdown,
            size_status: item.size_status,
            user_size: input.userSize ?? null,
          },
        ]
      : [];
  });
  const { data, error } = await db.rpc("replace_cheaper_look_products", {
    p_look_id: input.lookId,
    p_slot: input.slot,
    p_reference_product_id: input.referenceProductId,
    p_max_price_amount: input.maxPrice.amount,
    p_max_price_currency: input.maxPrice.currency,
    p_items: toJson(items),
  });
  if (error) fail("No se pudieron guardar las alternativas más baratas.", error);
  return data ?? 0;
}

/**
 * Borra los resultados de las prendas que ya no están en el look (una búsqueda completa
 * reemplaza el look entero: no quedan productos viejos en slots que no volvieron).
 */
export async function removeLookProductsExcept(
  db: TypedSupabaseClient,
  lookId: string,
  keepSlots: GarmentSlot[],
): Promise<void> {
  // Los slots van al filtro de PostgREST como texto: solo los que cumplen el formato.
  const slots = keepSlots.filter((s) => GarmentSlotSchema.safeParse(s).success);
  let query = db.from("look_products").delete().eq("look_id", lookId);
  if (slots.length > 0) {
    query = query.not("garment_slot", "in", `(${slots.map((s) => `"${s}"`).join(",")})`);
  }
  const { error } = await query;
  if (error) fail("No se pudieron limpiar los resultados del look.", error);
}

export interface LookProductResult {
  slot: string;
  rank: number;
  score: number;
  breakdown: Partial<ScoreBreakdown>;
  sizeStatus: SizeStatus | null;
  /** Talle con el que se calculó `sizeStatus` (null: sin talle o filas anteriores). */
  userSize: string | null;
  /** Ranking principal o "más baratas" que `cheaperThan.productId` (paso 09). */
  list: "MAIN" | "CHEAPER";
  cheaperThan: { productId: string; maxPrice: Money } | null;
  product: StoredProduct;
}

/**
 * Resultados de un look, por prenda y en orden. Con el cliente del usuario, la RLS solo
 * los devuelve al dueño Premium.
 */
export async function getLookProducts(
  db: TypedSupabaseClient,
  lookId: string,
): Promise<LookProductResult[]> {
  const { data, error } = await db
    .from("look_products")
    .select(
      `garment_slot, rank, score, score_breakdown, size_status, user_size, list, reference_product_id, max_price_amount, max_price_currency, products!look_products_product_id_fkey (${PRODUCT_COLUMNS})`,
    )
    .eq("look_id", lookId)
    .order("garment_slot")
    .order("list", { ascending: false })
    .order("rank");
  if (error) fail("No se pudieron leer los productos del look.", error);
  return (data ?? []).flatMap((row) => {
    const stored = row.products ? toStored(row.products) : null;
    if (!stored) return [];
    const status = SizeStatusSchema.safeParse(row.size_status);
    return [
      {
        slot: row.garment_slot,
        rank: row.rank,
        score: Number(row.score),
        breakdown: row.score_breakdown as Partial<ScoreBreakdown>,
        sizeStatus: status.success ? status.data : null,
        userSize: row.user_size,
        list: row.list === "CHEAPER" ? "CHEAPER" : "MAIN",
        cheaperThan:
          row.list === "CHEAPER" &&
          row.reference_product_id &&
          row.max_price_amount !== null &&
          row.max_price_currency
            ? {
                productId: row.reference_product_id,
                maxPrice: {
                  amount: Number(row.max_price_amount),
                  currency: row.max_price_currency,
                },
              }
            : null,
        product: stored,
      },
    ];
  });
}

// --- Cache de pools de búsqueda ------------------------------------------------------

/** Borra los pools vencidos. Se llama al guardar uno nuevo (barato: hay índice). */
export async function purgeExpiredSearchCache(
  db: TypedSupabaseClient,
  now: Date = new Date(),
): Promise<void> {
  const { error } = await db
    .from("shopping_search_cache")
    .delete()
    .lt("expires_at", now.toISOString());
  if (error) fail("No se pudo limpiar la cache de búsquedas.", error);
}

/**
 * Cache de pools en Postgres para `searchProducts` (cumple `SearchCache` de
 * `@asesor/shopping`). Guarda los productos en `products` y en la cache solo sus uuids.
 */
export function createPostgresSearchCache(
  db: TypedSupabaseClient,
  options: { now?: () => Date } = {},
) {
  const now = options.now ?? (() => new Date());
  return {
    async getPool(key: string) {
      const { data, error } = await db
        .from("shopping_search_cache")
        .select("product_ids, stats, created_at")
        .eq("key", key)
        .gt("expires_at", now().toISOString())
        .maybeSingle();
      if (error) fail("No se pudo leer la cache de búsquedas.", error);
      if (!data) return null;
      const stats = ShoppingStatsSchema.safeParse(data.stats);
      if (!stats.success) return null;
      const stored = await getProductsByIds(db, data.product_ids);
      return {
        products: stored.map((s) => s.product),
        stats: stats.data,
        cachedAt: new Date(data.created_at).toISOString(),
      };
    },

    async savePool(
      key: string,
      entry: { query: unknown; products: Product[]; stats: ShoppingStats },
      ttlMs: number,
    ) {
      const ids = await upsertProducts(db, entry.products);
      const productIds = [
        ...new Set(entry.products.flatMap((p) => (ids.has(p.url) ? [ids.get(p.url)!] : []))),
      ];
      const at = now();
      const { error } = await db.from("shopping_search_cache").upsert(
        {
          key,
          query_json: toJson(entry.query),
          product_ids: productIds,
          stats: toJson(entry.stats),
          created_at: at.toISOString(),
          expires_at: new Date(at.getTime() + ttlMs).toISOString(),
        },
        { onConflict: "key" },
      );
      if (error) fail("No se pudo guardar la cache de búsquedas.", error);
      await purgeExpiredSearchCache(db, at);
    },

    async updateProducts(products: Array<{ product: Product; verified: boolean }>) {
      await upsertProducts(
        db,
        products.map((p) => p.product),
      );
    },
  };
}
