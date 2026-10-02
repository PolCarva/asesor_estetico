import { AppError, isPremiumSubscription } from "@asesor/shared";

import type { SubscriptionRow, TypedSupabaseClient } from "./types";

export interface AuthUser {
  id: string;
  email: string | null;
}

/**
 * Usuario de la sesión actual o null. Usa getUser(), que valida el token contra
 * Supabase Auth (no confía solo en la cookie).
 */
export async function getCurrentUser(client: TypedSupabaseClient): Promise<AuthUser | null> {
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

/** Exige sesión. Lanza AppError("AUTH_REQUIRED") si no hay usuario. */
export async function requireAuth(client: TypedSupabaseClient): Promise<AuthUser> {
  const user = await getCurrentUser(client);
  if (!user) throw new AppError("AUTH_REQUIRED", "Tenés que iniciar sesión.");
  return user;
}

/** Suscripción más reciente del usuario (o null si nunca tuvo). */
export async function getLatestSubscription(
  client: TypedSupabaseClient,
  userId: string,
): Promise<SubscriptionRow | null> {
  const { data, error } = await client
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .order("current_period_end", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new AppError("INTERNAL", "No se pudo leer la suscripción.", { cause: error });
  return data;
}

/**
 * La suscripción que hoy da Premium, si hay alguna: cualquier fila `ACTIVE` o `CANCELLED` con
 * período vigente, igual que `current_user_is_premium()` en SQL (la RLS). Mirar solo la más
 * reciente podía dar otra respuesta que la base con varias filas (paso 11).
 */
export async function getPremiumSubscription(
  client: TypedSupabaseClient,
  userId: string,
  now = new Date(),
): Promise<SubscriptionRow | null> {
  const { data, error } = await client
    .from("subscriptions")
    .select("*")
    .eq("user_id", userId)
    .in("status", ["ACTIVE", "CANCELLED"])
    .gt("current_period_end", now.toISOString())
    .order("current_period_end", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new AppError("INTERNAL", "No se pudo leer la suscripción.", { cause: error });
  return data && isPremiumSubscription(data, now) ? data : null;
}

/** Exige sesión y Premium vigente. */
export async function requirePremium(
  client: TypedSupabaseClient,
  now = new Date(),
): Promise<AuthUser & { subscription: SubscriptionRow }> {
  const user = await requireAuth(client);
  const subscription = await getPremiumSubscription(client, user.id, now);
  if (!subscription) throw new AppError("PREMIUM_REQUIRED", "Esta función es Premium.");
  return { ...user, subscription };
}

/** Exige sesión y rol admin (leído de profiles, que el usuario no puede modificar). */
export async function requireAdmin(client: TypedSupabaseClient): Promise<AuthUser> {
  const user = await requireAuth(client);
  const { data, error } = await client
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new AppError("INTERNAL", "No se pudo leer el perfil.", { cause: error });
  if (data?.role !== "admin") throw new AppError("FORBIDDEN", "Acceso restringido.");
  return user;
}

/**
 * Verifica que el recurso exista y pertenezca al usuario. Ante un recurso ajeno
 * responde NOT_FOUND (no FORBIDDEN) para no revelar que existe (evita IDOR).
 */
export function requireResourceOwner<T extends { user_id: string }>(
  resource: T | null | undefined,
  userId: string,
): T {
  if (!resource || resource.user_id !== userId) {
    throw new AppError("NOT_FOUND", "Recurso no encontrado.");
  }
  return resource;
}
