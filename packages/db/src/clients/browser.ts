import { getPublicEnv } from "@asesor/config/env/public";
import { createBrowserClient } from "@supabase/ssr";

import type { TypedSupabaseClient } from "../types";

let client: TypedSupabaseClient | undefined;

/** Cliente para componentes de cliente. Usa solo la anon key; RLS aplica siempre. */
export function getBrowserSupabaseClient(): TypedSupabaseClient {
  const env = getPublicEnv();
  client ??= createBrowserClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  return client;
}
