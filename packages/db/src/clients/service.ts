import "server-only";

import { getServerEnv } from "@asesor/config/env/server";

import type { TypedSupabaseClient } from "../types";
import { createAdminClient } from "./admin";

let client: TypedSupabaseClient | undefined;

/**
 * Cliente service role para el servidor Next.js (webhooks, admin, lecturas que
 * RLS no permite al usuario). Nunca pasar el resultado a componentes de cliente.
 */
export function getServiceRoleClient(): TypedSupabaseClient {
  const env = getServerEnv();
  client ??= createAdminClient({
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  });
  return client;
}
