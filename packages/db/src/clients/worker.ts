import type { WorkerEnv } from "@asesor/config/env/worker";

import type { TypedSupabaseClient } from "../types";
import { createAdminClient } from "./admin";

/** Cliente del worker: service role, sin sesión de usuario. */
export function createWorkerSupabaseClient(env: WorkerEnv): TypedSupabaseClient {
  return createAdminClient({
    url: env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: env.SUPABASE_SERVICE_ROLE_KEY,
  });
}
