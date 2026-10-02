import { AppError } from "@asesor/shared";

import { requireAuth, requirePremium } from "./auth";
import type { Insert, TypedSupabaseClient } from "./types";

/**
 * Guardados (paso 10a, D19): `favorites` guarda un look o un producto. Los looks se guardan
 * con cualquier plan; los productos (resultados del shopping) son Premium, en la RLS y acá.
 */

export type FavoriteTarget =
  { lookId: string; productId?: never } | { productId: string; lookId?: never };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(message: string, cause: unknown): never {
  throw new AppError("INTERNAL", message, { cause });
}

async function authorize(client: TypedSupabaseClient, target: FavoriteTarget, now?: Date) {
  const id = target.lookId ?? target.productId;
  if (!id || !UUID.test(id)) throw new AppError("VALIDATION_FAILED", "Pedido inválido.");
  return target.productId ? requirePremium(client, now) : requireAuth(client);
}

export interface SaveFavoriteResult {
  favoriteId: string;
  /** Ya estaba guardado: no se duplica. */
  alreadySaved: boolean;
  /** Tienda del producto guardado (para analytics); null para un look. */
  storeDomain: string | null;
}

/**
 * Guarda un look (suyo y visible: un free solo ve el look 1) o un producto (Premium). Es
 * idempotente. Errores: AUTH_REQUIRED, PREMIUM_REQUIRED (productos), NOT_FOUND.
 */
export async function saveFavorite(input: {
  userClient: TypedSupabaseClient;
  target: FavoriteTarget;
  now?: Date;
}): Promise<SaveFavoriteResult> {
  const client = input.userClient;
  const user = await authorize(client, input.target, input.now);
  const { lookId, productId } = input.target;

  let storeDomain: string | null = null;
  if (lookId) {
    const { data, error } = await client
      .from("looks")
      .select("id")
      .eq("id", lookId)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) fail("No se pudo leer el look.", error);
    if (!data) throw new AppError("NOT_FOUND", "Look inexistente.");
  } else {
    const { data, error } = await client
      .from("products")
      .select("store_domain")
      .eq("id", productId!)
      .maybeSingle();
    if (error) fail("No se pudo leer el producto.", error);
    if (!data) throw new AppError("NOT_FOUND", "Producto inexistente.");
    storeDomain = data.store_domain;
  }

  const row: Insert<"favorites"> = lookId
    ? { user_id: user.id, look_id: lookId }
    : { user_id: user.id, product_id: productId! };
  const inserted = await client.from("favorites").insert(row).select("id").single();
  if (!inserted.error && inserted.data) {
    return { favoriteId: inserted.data.id, alreadySaved: false, storeDomain };
  }
  if (inserted.error?.code === "42501") {
    throw new AppError("PREMIUM_REQUIRED", "Esta función es Premium.");
  }
  if (inserted.error?.code !== "23505") fail("No se pudo guardar.", inserted.error);

  const query = client.from("favorites").select("id").eq("user_id", user.id);
  const existing = await (
    lookId ? query.eq("look_id", lookId) : query.eq("product_id", productId!)
  ).maybeSingle();
  if (existing.error || !existing.data) fail("No se pudo leer el guardado.", existing.error);
  return { favoriteId: existing.data.id, alreadySaved: true, storeDomain };
}

/** Quita un look o un producto de los guardados. `removed: false` si no estaba. */
export async function removeFavorite(input: {
  userClient: TypedSupabaseClient;
  target: FavoriteTarget;
  now?: Date;
}): Promise<{ removed: boolean }> {
  const client = input.userClient;
  const user = await authorize(client, input.target, input.now);
  const { lookId, productId } = input.target;
  const query = client.from("favorites").delete().eq("user_id", user.id);
  const { data, error } = await (
    lookId ? query.eq("look_id", lookId) : query.eq("product_id", productId!)
  ).select("id");
  if (error) fail("No se pudo quitar de guardados.", error);
  return { removed: (data ?? []).length > 0 };
}
