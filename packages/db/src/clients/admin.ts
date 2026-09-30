import { createClient } from "@supabase/supabase-js";

import type { TypedSupabaseClient } from "../types";

/**
 * Cliente con service role: saltea RLS. Solo para código de servidor o worker,
 * y solo cuando la operación no puede hacerse con el cliente del usuario.
 */
export function createAdminClient(options: {
  url: string;
  serviceRoleKey: string;
}): TypedSupabaseClient {
  if ("window" in globalThis) {
    throw new Error("El cliente service role no puede usarse en el navegador.");
  }
  return createClient(options.url, options.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
