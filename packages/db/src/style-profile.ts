import {
  AppError,
  parseStoredStyleProfile,
  type StoredStyleProfile,
  type StyleProfileCore,
} from "@asesor/shared";

import type { TypedSupabaseClient } from "./types";

/**
 * Perfil de estilo activo del usuario, leído de forma tolerante (v1 o v2).
 *
 * Con el cliente del usuario, la RLS decide la asesoría: `advice` llega solo si es
 * Premium. Con service role se lee todo, así que filtra siempre por `userId`.
 * Devuelve `null` si no hay perfil activo o si no es válido.
 */
export async function getActiveStyleProfile(
  db: TypedSupabaseClient,
  userId: string,
  options: { includeAdvice?: boolean } = {},
): Promise<(StoredStyleProfile & { id: string }) | null> {
  const { data, error } = await db
    .from("style_profiles")
    .select("id, profile_json")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  if (error)
    throw new AppError("INTERNAL", "No se pudo leer el perfil de estilo.", { cause: error });
  if (!data) return null;

  let adviceJson: unknown = null;
  if (options.includeAdvice ?? true) {
    const advice = await db
      .from("style_advice")
      .select("advice_json")
      .eq("style_profile_id", data.id)
      .eq("user_id", userId)
      .maybeSingle();
    if (advice.error)
      throw new AppError("INTERNAL", "No se pudo leer la asesoría.", { cause: advice.error });
    adviceJson = advice.data?.advice_json ?? null;
  }

  const stored = parseStoredStyleProfile(data.profile_json, adviceJson);
  return stored ? { id: data.id, ...stored } : null;
}

/**
 * Núcleo de un perfil por id (activo o no), del usuario: el de un look puede no ser el
 * perfil activo. Lo usa la búsqueda de productos para el público. `null` si no existe o
 * no es válido.
 */
export async function getStyleProfileCore(
  db: TypedSupabaseClient,
  profileId: string,
  userId: string,
): Promise<StyleProfileCore | null> {
  const { data, error } = await db
    .from("style_profiles")
    .select("profile_json")
    .eq("id", profileId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error)
    throw new AppError("INTERNAL", "No se pudo leer el perfil de estilo.", { cause: error });
  return data ? (parseStoredStyleProfile(data.profile_json)?.profile ?? null) : null;
}
