import "server-only";

import { getLatestSubscription, type LookRow } from "@asesor/db";
import { createServerSupabaseClient } from "@asesor/db/server";
import { getServiceRoleClient } from "@asesor/db/service";
import {
  isPremiumSubscription,
  type LookSpec,
  LookSpecSchema,
  SIGNED_URL_TTL_SECONDS,
  STORAGE_BUCKETS,
  type StyleProfile,
  StyleProfileSchema,
} from "@asesor/shared";
import { cache } from "react";

/**
 * Consultas de las páginas de /app. Usan el cliente del usuario (RLS). Solo los
 * resúmenes de looks bloqueados usan service role, y solo columnas no sensibles.
 */

export const getPlan = cache(async (userId: string) => {
  const client = await createServerSupabaseClient();
  const subscription = await getLatestSubscription(client, userId);
  return { subscription, isPremium: isPremiumSubscription(subscription) };
});

export const getProfile = cache(async (userId: string) => {
  const client = await createServerSupabaseClient();
  const { data } = await client.from("profiles").select("*").eq("id", userId).maybeSingle();
  return data;
});

export async function getActiveStyleProfile(userId: string): Promise<StyleProfile | null> {
  const client = await createServerSupabaseClient();
  const { data } = await client
    .from("style_profiles")
    .select("profile_json")
    .eq("user_id", userId)
    .eq("active", true)
    .maybeSingle();
  const parsed = StyleProfileSchema.safeParse(data?.profile_json);
  return parsed.success ? parsed.data : null;
}

export type LookView =
  | {
      locked: false;
      id: string;
      position: number;
      status: LookRow["status"];
      spec: LookSpec;
      /** URL firmada de corta duración de la imagen generada (null si todavía no hay). */
      imageUrl: string | null;
    }
  | { locked: true; id: string; position: number; status: LookRow["status"]; name: string };

/** Looks del perfil activo: completos si están desbloqueados, solo nombre si no. */
export async function getLooks(userId: string): Promise<LookView[]> {
  const client = await createServerSupabaseClient();
  const { data: unlocked } = await client
    .from("looks")
    .select("id, position, status, spec_json, image_storage_path")
    .eq("user_id", userId)
    .order("position");

  // Resumen de los bloqueados (RLS no los devuelve al usuario free).
  const { data: all } = await getServiceRoleClient()
    .from("looks")
    .select("id, position, status, name, style_profile_id, style_profiles!inner(active)")
    .eq("user_id", userId)
    .eq("style_profiles.active", true)
    .order("position");

  const unlockedById = new Map((unlocked ?? []).map((l) => [l.id, l]));
  return Promise.all(
    (all ?? []).map(async (look): Promise<LookView> => {
      const full = unlockedById.get(look.id);
      const spec = full ? LookSpecSchema.safeParse(full.spec_json) : null;
      if (full && spec?.success) {
        // Se firma con el cliente del usuario: la política de Storage vuelve a verificar dueño y plan.
        const signed = full.image_storage_path
          ? await client.storage
              .from(STORAGE_BUCKETS.generatedLooks)
              .createSignedUrl(full.image_storage_path, SIGNED_URL_TTL_SECONDS)
          : null;
        return {
          locked: false,
          id: look.id,
          position: look.position,
          status: look.status,
          spec: spec.data,
          imageUrl: signed?.data?.signedUrl ?? null,
        };
      }
      return {
        locked: true,
        id: look.id,
        position: look.position,
        status: look.status,
        name: look.name,
      };
    }),
  );
}
