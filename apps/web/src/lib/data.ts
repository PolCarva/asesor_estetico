import "server-only";

import {
  getActiveStyleProfile as readActiveStyleProfile,
  getLatestSubscription,
  getUserPhotoSignedUrl,
  type LookRow,
} from "@asesor/db";
import { createServerSupabaseClient } from "@asesor/db/server";
import { getServiceRoleClient } from "@asesor/db/service";
import {
  type AdviceView,
  isPremiumSubscription,
  type LookSpec,
  StoredLookSpecSchema,
  SIGNED_URL_TTL_SECONDS,
  STORAGE_BUCKETS,
  selectAdviceForPlan,
  type StyleAdvice,
  type StyleProfileCore,
  type UserPhotoType,
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

/** Núcleo del perfil activo (lo ve cualquier plan). Tolera perfiles v1 guardados. */
export async function getActiveStyleProfile(userId: string): Promise<StyleProfileCore | null> {
  const client = await createServerSupabaseClient();
  const stored = await readActiveStyleProfile(client, userId, { includeAdvice: false });
  return stored?.profile ?? null;
}

/**
 * Perfil activo para "Mi perfil": núcleo para cualquier plan y asesoría solo Premium. La
 * parte Premium (`style_advice`) se consulta solo si el usuario es Premium, con su
 * cliente (RLS); a free nunca le llega (ni la de un perfil v1 guardado en `profile_json`).
 */
export const getStyleData = cache(
  async (
    userId: string,
  ): Promise<{ core: StyleProfileCore; advice: StyleAdvice | null; view: AdviceView } | null> => {
    const [client, plan] = await Promise.all([createServerSupabaseClient(), getPlan(userId)]);
    const stored = await readActiveStyleProfile(client, userId, {
      includeAdvice: plan.isPremium,
    });
    if (!stored) return null;
    return {
      core: stored.profile,
      advice: plan.isPremium ? stored.advice : null,
      view: selectAdviceForPlan(stored.profile, stored.advice, plan.isPremium),
    };
  },
);

/** Asesoría de imagen según el plan (view model de `selectAdviceForPlan`). */
export async function getAdviceView(userId: string): Promise<AdviceView | null> {
  return (await getStyleData(userId))?.view ?? null;
}

/** URLs firmadas de corta duración de las fotos del usuario, por tipo. Nunca se cachean. */
export async function getPhotoUrls(
  userId: string,
): Promise<Partial<Record<UserPhotoType, string>>> {
  const client = await createServerSupabaseClient();
  const { data } = await client.from("user_photos").select("id, type").eq("user_id", userId);
  const entries = await Promise.all(
    (data ?? []).map(async (photo) => {
      const url = await getUserPhotoSignedUrl(client, { userId, photoId: photo.id }).catch(
        () => null,
      );
      return [photo.type, url] as const;
    }),
  );
  return Object.fromEntries(entries.filter(([, url]) => url !== null));
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
      const spec = full ? StoredLookSpecSchema.safeParse(full.spec_json) : null;
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

/** Número e id de los looks del perfil activo (para navegar entre ellos). Sin datos del spec. */
export async function getLookSummaries(
  userId: string,
): Promise<Array<{ id: string; position: number }>> {
  const { data } = await getServiceRoleClient()
    .from("looks")
    .select("id, position, style_profiles!inner(active)")
    .eq("user_id", userId)
    .eq("style_profiles.active", true)
    .order("position");
  return (data ?? []).map(({ id, position }) => ({ id, position }));
}

export type LookDetail =
  | {
      locked: false;
      id: string;
      position: number;
      status: LookRow["status"];
      spec: LookSpec;
      imageUrl: string | null;
    }
  | { locked: true; id: string; position: number; name: string };

/**
 * Un look del perfil activo. Desbloqueado: spec completo (RLS). Bloqueado: solo nombre y
 * posición (service role, columnas no sensibles). Ajeno, inexistente o de un perfil viejo: null.
 */
export async function getLook(userId: string, lookId: string): Promise<LookDetail | null> {
  if (!/^[0-9a-f-]{36}$/i.test(lookId)) return null;
  const { data: summary } = await getServiceRoleClient()
    .from("looks")
    .select("id, position, name, style_profiles!inner(active)")
    .eq("id", lookId)
    .eq("user_id", userId)
    .eq("style_profiles.active", true)
    .maybeSingle();
  if (!summary) return null;

  const client = await createServerSupabaseClient();
  const { data: full } = await client
    .from("looks")
    .select("id, position, status, spec_json, image_storage_path")
    .eq("id", lookId)
    .eq("user_id", userId)
    .maybeSingle();
  const spec = full ? StoredLookSpecSchema.safeParse(full.spec_json) : null;
  if (!full || !spec?.success)
    return { locked: true, id: summary.id, position: summary.position, name: summary.name };

  const signed = full.image_storage_path
    ? await client.storage
        .from(STORAGE_BUCKETS.generatedLooks)
        .createSignedUrl(full.image_storage_path, SIGNED_URL_TTL_SECONDS)
    : null;
  return {
    locked: false,
    id: full.id,
    position: full.position,
    status: full.status,
    spec: spec.data,
    imageUrl: signed?.data?.signedUrl ?? null,
  };
}
