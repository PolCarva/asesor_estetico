import "server-only";

import { getPublicEnv } from "@asesor/config/env/public";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

import type { TypedSupabaseClient } from "../types";

/**
 * Cliente para Server Components, Server Actions y Route Handlers de Next.js.
 * Actúa como el usuario de la sesión (cookies): RLS aplica siempre.
 */
export async function createServerSupabaseClient(): Promise<TypedSupabaseClient> {
  const env = getPublicEnv();
  const cookieStore = await cookies();

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Llamado desde un Server Component: no puede escribir cookies.
          // El proxy (apps/web/src/proxy.ts) se encarga de refrescar la sesión.
        }
      },
    },
  });
}
