import { parseEnv } from "./parse";
import { type PublicEnv, PublicEnvSchema } from "./schemas";

export type { PublicEnv };

let cached: PublicEnv | undefined;

/**
 * Variables públicas. Cada NEXT_PUBLIC_* se referencia de forma literal para
 * que Next.js las incruste en el bundle del cliente.
 */
export function getPublicEnv(): PublicEnv {
  cached ??= parseEnv(
    PublicEnvSchema,
    {
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      NEXT_PUBLIC_ANALYTICS_ENABLED: process.env.NEXT_PUBLIC_ANALYTICS_ENABLED,
    },
    "public",
  );
  return cached;
}
