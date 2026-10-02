import { z } from "zod";

const booleanString = z
  .enum(["true", "false", "1", "0"])
  .transform((value) => value === "true" || value === "1");

export const NodeEnvSchema = z.enum(["development", "test", "production"]).default("development");
export const LogLevelSchema = z.enum(["debug", "info", "warn", "error"]).default("info");

/** Variables públicas: pueden terminar en el bundle del navegador. Nunca poner secretos acá. */
export const PublicEnvSchema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  NEXT_PUBLIC_ANALYTICS_ENABLED: booleanString.default(false),
});
export type PublicEnv = z.infer<typeof PublicEnvSchema>;

/** Variables del servidor Next.js (route handlers, server actions, server components). */
export const ServerEnvSchema = PublicEnvSchema.extend({
  NODE_ENV: NodeEnvSchema,
  LOG_LEVEL: LogLevelSchema,
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  // Opcionales mientras se usa el proveedor de pagos mock.
  MERCADOPAGO_ACCESS_TOKEN: z.string().min(1).optional(),
  MERCADOPAGO_WEBHOOK_SECRET: z.string().min(1).optional(),
});
export type ServerEnv = z.infer<typeof ServerEnvSchema>;

/**
 * Modelos por defecto en OpenRouter. Se pueden cambiar sin tocar código.
 * El de texto tiene que soportar JSON Schema estricto con schemas grandes
 * (StyleProfile, LookSpec): Anthropic los rechaza por tamaño de gramática.
 */
export const DEFAULT_OPENROUTER_TEXT_MODEL = "google/gemini-3.8-flash";
export const DEFAULT_OPENROUTER_IMAGE_MODEL = "google/gemini-3.1-flash-image";

/** Variables del worker (es quien llama a la IA). No incluye nada de Next ni de pagos. */
export const WorkerEnvSchema = z
  .object({
    NODE_ENV: NodeEnvSchema,
    LOG_LEVEL: LogLevelSchema,
    NEXT_PUBLIC_SUPABASE_URL: z.url(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
    WORKER_CONCURRENCY: z.coerce.number().int().min(1).max(16).default(2),
    /** mock: sin red ni costo (prohibido en producción). openrouter: IA real (requiere OPENROUTER_API_KEY). */
    AI_PROVIDER: z.enum(["mock", "openrouter"]).default("mock"),
    OPENROUTER_API_KEY: z.string().min(1).optional(),
    OPENROUTER_TEXT_MODEL: z.string().min(1).default(DEFAULT_OPENROUTER_TEXT_MODEL),
    OPENROUTER_IMAGE_MODEL: z.string().min(1).default(DEFAULT_OPENROUTER_IMAGE_MODEL),
    AI_IMAGE_QUALITY: z.enum(["low", "medium", "high"]).default("medium"),
    /**
     * live (default): tiendas reales. mock: catálogo ficticio, solo para tests y E2E.
     * El default es live a propósito: un worker sin la variable nunca sirve productos falsos.
     */
    SHOPPING_PROVIDER: z.enum(["mock", "live"]).default("live"),
    /** Contacto (URL o email) que se agrega al user agent del bot de shopping. */
    SHOPPING_BOT_CONTACT: z.string().min(3).max(120).optional(),
  })
  .refine((env) => env.AI_PROVIDER !== "openrouter" || Boolean(env.OPENROUTER_API_KEY), {
    path: ["OPENROUTER_API_KEY"],
    message: "Requerida con AI_PROVIDER=openrouter",
  })
  .refine((env) => env.NODE_ENV !== "production" || env.SHOPPING_PROVIDER !== "mock", {
    path: ["SHOPPING_PROVIDER"],
    message: "mock no está permitido en producción",
  })
  // La IA mock devuelve un análisis ficticio: en producción sería inventar (paso 11).
  .refine((env) => env.NODE_ENV !== "production" || env.AI_PROVIDER !== "mock", {
    path: ["AI_PROVIDER"],
    message: "mock no está permitido en producción",
  });
export type WorkerEnv = z.infer<typeof WorkerEnvSchema>;
