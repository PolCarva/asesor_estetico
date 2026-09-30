import "server-only";

import { type AuthUser, getCurrentUser, requireAdmin } from "@asesor/db";
import { createServerSupabaseClient } from "@asesor/db/server";
import { notFound, redirect } from "next/navigation";
import { cache } from "react";

/** Usuario de la sesión (una sola validación por request gracias a cache()). */
export const getSessionUser = cache(async (): Promise<AuthUser | null> => {
  const client = await createServerSupabaseClient();
  return getCurrentUser(client);
});

/** Para páginas: redirige a /login si no hay sesión. El proxy ya filtra, esto es la segunda barrera. */
export async function requireUser(nextPath = "/app/dashboard"): Promise<AuthUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(nextPath)}`);
  return user;
}

/** Para /admin: responde 404 a quien no es admin (no revela que la sección existe). */
export async function requireAdminUser(): Promise<AuthUser> {
  const client = await createServerSupabaseClient();
  try {
    return await requireAdmin(client);
  } catch {
    notFound();
  }
}
