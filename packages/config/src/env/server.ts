import { type EnvSource, parseEnv } from "./parse";
import { type ServerEnv, ServerEnvSchema } from "./schemas";

export type { ServerEnv };

export function assertServerRuntime(scope: string) {
  if ("window" in globalThis) {
    throw new Error(
      `[env:${scope}] Estas variables son privadas y no pueden usarse en el navegador.`,
    );
  }
}

let cached: ServerEnv | undefined;

/** Variables privadas del servidor Next.js. Falla si se importa en el navegador. */
export function getServerEnv(source: EnvSource = process.env): ServerEnv {
  assertServerRuntime("server");
  if (source !== process.env) return parseEnv(ServerEnvSchema, source, "server");
  cached ??= parseEnv(ServerEnvSchema, source, "server");
  return cached;
}
