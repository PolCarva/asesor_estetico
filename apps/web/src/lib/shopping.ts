import "server-only";

import { getLatestLookSearch, type LookSearchState } from "@asesor/db";
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
