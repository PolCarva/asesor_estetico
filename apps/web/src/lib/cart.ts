import "server-only";

import { getCartLines, getLookProducts } from "@asesor/db";
import { createServerSupabaseClient } from "@asesor/db/server";
import {
  buildCartView,
  type CartView,
  type Garment,
  listLookGarments,
  type ProductAvailability,
  StoredLookSpecSchema,
} from "@asesor/shared";
import { cache } from "react";

import { formatMoney } from "./look-results";

/**
 * Lecturas del carrito y de los guardados para la UI (paso 10b). Todo con el cliente del
 * usuario: la RLS solo devuelve lo suyo (y los resultados de los looks, solo a Premium).
 */

/** Productos pendientes del carrito (el contador del header). */
export const getCartCount = cache(async (): Promise<number> => {
  const supabase = await createServerSupabaseClient();
  const { count } = await supabase
    .from("cart_items")
    .select("id", { count: "exact", head: true })
    .is("purchased_at", null);
  return count ?? 0;
});

/**
 * Qué hay de un look en el carrito: claves `prenda|producto` (para "En el carrito ✓" en cada
 * producto) y las prendas que ya tienen algo (para "El look está en tu carrito").
 */
export async function getLookCart(
  lookId: string,
): Promise<{ products: Set<string>; slots: Set<string> }> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("cart_items")
    .select("product_id, garment_slot")
    .eq("look_id", lookId);
  return {
    products: new Set((data ?? []).map((row) => `${row.garment_slot}|${row.product_id}`)),
    slots: new Set((data ?? []).flatMap((row) => (row.garment_slot ? [row.garment_slot] : []))),
  };
}

/** Ids de los looks y productos guardados. */
export const getSavedIds = cache(async () => {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.from("favorites").select("look_id, product_id");
  return {
    looks: new Set((data ?? []).flatMap((f) => (f.look_id ? [f.look_id] : []))),
    products: new Set((data ?? []).flatMap((f) => (f.product_id ? [f.product_id] : []))),
  };
});

/** Otra opción de la misma prenda para "Cambiar" en el carrito. */
export interface SwapOption {
  productId: string;
  title: string;
  storeName: string;
  imageUrl: string | null;
  price: string;
}

export interface CartPageData {
  view: CartView;
  /** Prenda del look de cada ítem (descripción y color), por `look|prenda`. */
  garments: Map<string, Garment>;
  /** Alternativas con precio de cada prenda (sin el producto del ítem), por `look|prenda`. */
  alternatives: Map<string, SwapOption[]>;
  /** Productos guardados (♡). */
  savedProducts: Set<string>;
}

export const slotKey = (lookId: string | null | undefined, slot: string | null) =>
  `${lookId ?? ""}|${slot ?? ""}`;

/**
 * Carrito agrupado (`buildCartView`) con lo que la pantalla necesita alrededor: la prenda de
 * cada ítem y sus alternativas (las mismas opciones que guardó la búsqueda del look).
 */
export async function getCartPage(): Promise<CartPageData> {
  const supabase = await createServerSupabaseClient();
  const [lines, saved] = await Promise.all([getCartLines(supabase), getSavedIds()]);
  const view = buildCartView(lines);
  const lookIds = [...new Set(lines.flatMap((l) => (l.look ? [l.look.id] : [])))];

  const garments = new Map<string, Garment>();
  const alternatives = new Map<string, SwapOption[]>();
  if (lookIds.length > 0) {
    const [{ data: looks }, results] = await Promise.all([
      supabase.from("looks").select("id, spec_json").in("id", lookIds),
      Promise.all(lookIds.map((id) => getLookProducts(supabase, id))),
    ]);
    for (const look of looks ?? []) {
      const spec = StoredLookSpecSchema.safeParse(look.spec_json);
      if (!spec.success) continue;
      for (const { slot, garment } of listLookGarments(spec.data)) {
        garments.set(slotKey(look.id, slot), garment);
      }
    }
    lookIds.forEach((lookId, i) => {
      for (const row of results[i] ?? []) {
        const price = row.product.product.price;
        if (!price) continue;
        const key = slotKey(lookId, row.slot);
        const list = alternatives.get(key) ?? [];
        if (list.some((o) => o.productId === row.product.id)) continue;
        const image = row.product.product.image_url;
        list.push({
          productId: row.product.id,
          title: row.product.product.title,
          storeName: row.product.product.store.name,
          imageUrl: image?.startsWith("https://") ? image : null,
          price: formatMoney(price),
        });
        alternatives.set(key, list);
      }
    });
  }
  return { view, garments, alternatives, savedProducts: saved.products };
}

export interface SavedProductView {
  productId: string;
  title: string;
  storeName: string;
  storeDomain: string;
  imageUrl: string | null;
  price: string | null;
  availability: ProductAvailability;
  fetchedAt: string;
  /** Un look del usuario donde aparece (para volver a él y agregarlo con su prenda). */
  look: { id: string; name: string | null; slot: string } | null;
  inCart: boolean;
}

/**
 * Guardados (paso 10b): ids de los looks (la pantalla los dibuja con `getLooks`) y los
 * productos con lo necesario para comprarlos. Dónde aparece cada producto sale de los
 * resultados de sus looks (RLS: solo Premium); sin Premium queda sin look.
 */
export async function getFavoritesPage(): Promise<{
  lookIds: string[];
  products: SavedProductView[];
}> {
  const supabase = await createServerSupabaseClient();
  const { data: favorites } = await supabase
    .from("favorites")
    .select(
      "look_id, product_id, created_at, products (id, title, store_name, store_domain, image_url, price_amount, currency, availability, last_fetched_at)",
    )
    .order("created_at", { ascending: false });
  const rows = favorites ?? [];
  const productIds = rows.flatMap((f) => (f.product_id ? [f.product_id] : []));

  const [{ data: appearances }, { data: cart }] = productIds.length
    ? await Promise.all([
        supabase
          .from("look_products")
          .select("product_id, garment_slot, look_id, looks (name)")
          .in("product_id", productIds),
        supabase.from("cart_items").select("product_id").in("product_id", productIds),
      ])
    : [{ data: [] }, { data: [] }];
  const inCart = new Set((cart ?? []).map((c) => c.product_id));
  const where = new Map<string, SavedProductView["look"]>();
  for (const row of appearances ?? []) {
    if (!where.has(row.product_id)) {
      where.set(row.product_id, {
        id: row.look_id,
        name: row.looks?.name ?? null,
        slot: row.garment_slot,
      });
    }
  }

  return {
    lookIds: rows.flatMap((f) => (f.look_id ? [f.look_id] : [])),
    products: rows.flatMap((f) => {
      const p = f.products;
      if (!p) return [];
      return [
        {
          productId: p.id,
          title: p.title,
          storeName: p.store_name,
          storeDomain: p.store_domain,
          imageUrl: p.image_url?.startsWith("https://") ? p.image_url : null,
          price:
            p.price_amount !== null && p.currency
              ? formatMoney({ amount: Number(p.price_amount), currency: p.currency })
              : null,
          availability: p.availability,
          fetchedAt: new Date(p.last_fetched_at).toISOString(),
          look: where.get(p.id) ?? null,
          inCart: inCart.has(p.id),
        },
      ];
    }),
  };
}
