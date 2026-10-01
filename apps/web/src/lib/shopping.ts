import "server-only";

import {
  getLatestLookSearch,
  getLookProducts,
  getSlotSearches,
  type LookProductResult,
  type LookSearchState,
} from "@asesor/db";
import { createServerSupabaseClient } from "@asesor/db/server";
import type { GarmentSlot } from "@asesor/shared";

/**
 * Estado y progreso (etapa, prendas terminadas y, al final, el resumen) de la última
 * búsqueda de productos de un look, o de una prenda. Con el cliente del usuario: la RLS
 * solo devuelve sus jobs y nunca `payload`, `result` ni `last_error`.
 */
export async function getLookShoppingState(
  lookId: string,
  slot?: GarmentSlot,
): Promise<LookSearchState | null> {
  const supabase = await createServerSupabaseClient();
  return getLatestLookSearch(supabase, lookId, { slot });
}

/**
 * Productos guardados para un look (paso 08), por prenda y en orden. Con el cliente del
 * usuario: la RLS de `look_products` solo se los devuelve al dueño Premium.
 */
export async function getLookResultRows(lookId: string): Promise<LookProductResult[]> {
  const supabase = await createServerSupabaseClient();
  return getLookProducts(supabase, lookId);
}

/** Última búsqueda de cada prenda suelta ("Buscar más barato") de un look, por slot. */
export async function getLookSlotSearches(lookId: string): Promise<Map<string, LookSearchState>> {
  const supabase = await createServerSupabaseClient();
  return getSlotSearches(supabase, lookId);
}
