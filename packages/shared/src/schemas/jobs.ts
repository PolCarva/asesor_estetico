import { z } from "zod";

import { UserSizesSchema } from "../sizes";
import { CurrencySchema } from "./common";
import { GarmentSlotSchema } from "./look-spec";
import { UserPhotoTypeSchema } from "./photos";

export const JobTypeSchema = z.enum([
  "VALIDATE_PHOTOS",
  "ANALYZE_STYLE_PROFILE",
  "GENERATE_LOOK_PREVIEW",
  "GENERATE_LOOK",
  "GENERATE_STYLE_BOARD",
  "SEARCH_PRODUCTS",
  "REFRESH_PRODUCT",
]);
export type JobType = z.infer<typeof JobTypeSchema>;

export const JobStatusSchema = z.enum(["QUEUED", "RUNNING", "COMPLETED", "FAILED"]);
export type JobStatus = z.infer<typeof JobStatusSchema>;

/**
 * Búsqueda de productos de un look (paso 06). Sin `slot`, busca todas las prendas y
 * reemplaza los resultados del look entero; con `slot`, solo esa prenda (paso 09), y
 * `max_price` es un tope estricto. Los talles van en el pedido: la búsqueda no lee el perfil.
 */
export const SearchProductsPayloadSchema = z
  .object({
    user_id: z.uuid(),
    look_id: z.uuid(),
    sizes: UserSizesSchema,
    slot: GarmentSlotSchema.optional(),
    max_price: z
      .object({ amount: z.number().positive().max(10_000_000), currency: CurrencySchema })
      .optional(),
  })
  .refine((p) => !p.max_price || p.slot, {
    message: "El precio máximo es por prenda: requiere slot.",
    path: ["max_price"],
  });

/** Payload validado de cada tipo de job. El worker lo vuelve a validar antes de procesar. */
export const JobPayloadSchemas = {
  VALIDATE_PHOTOS: z.object({
    user_id: z.uuid(),
    photos: z
      .array(z.object({ photo_id: z.uuid(), type: UserPhotoTypeSchema }))
      .min(1)
      .max(4),
  }),
  ANALYZE_STYLE_PROFILE: z.object({ user_id: z.uuid(), photo_ids: z.array(z.uuid()).min(1) }),
  GENERATE_LOOK_PREVIEW: z.object({ user_id: z.uuid(), look_id: z.uuid() }),
  GENERATE_LOOK: z.object({ user_id: z.uuid(), look_id: z.uuid() }),
  GENERATE_STYLE_BOARD: z.object({ user_id: z.uuid(), style_profile_id: z.uuid() }),
  SEARCH_PRODUCTS: SearchProductsPayloadSchema,
  REFRESH_PRODUCT: z.object({ product_id: z.uuid() }),
} as const satisfies Record<JobType, z.ZodType>;

export type JobPayload<T extends JobType> = z.infer<(typeof JobPayloadSchemas)[T]>;

/**
 * Espera antes del siguiente intento: backoff exponencial con tope.
 * attempts es la cantidad de intentos ya hechos (1 después del primero).
 */
export function computeRetryDelaySeconds(attempts: number, baseSeconds = 30, maxSeconds = 3600) {
  const exponent = Math.max(0, attempts - 1);
  return Math.min(maxSeconds, baseSeconds * 2 ** exponent);
}

// --- Progreso de la búsqueda de productos (paso 06, D14) -------------------------------

/**
 * Etapas reales del pipeline de shopping, en orden. Los textos ("Buscando prendas…") viven
 * en la web:
 * - SEARCHING: buscar URLs candidatas por prenda (registro, sitemaps, descubrimiento) o
 *   encontrar el pool en la cache;
 * - CHECKING_STORES: descargar y leer las páginas de producto de las tiendas;
 * - COMPARING: normalizar y validar cada producto (categoría, moneda, que venda en Uruguay);
 * - VERIFYING: talles y stock por plataforma, y revalidar lo cacheado de más de 8 h;
 * - RANKING: ordenar por similitud con la prenda y guardar los resultados.
 */
export const SHOPPING_STAGES = [
  "SEARCHING",
  "CHECKING_STORES",
  "COMPARING",
  "VERIFYING",
  "RANKING",
] as const;
export const ShoppingStageSchema = z.enum(SHOPPING_STAGES);
export type ShoppingStage = z.infer<typeof ShoppingStageSchema>;

const count = z.number().int().nonnegative().max(10_000);

/**
 * Resumen de una búsqueda terminada: va en `jobs.result` y, para la UI (que no lee
 * `result`), en el último progreso. Solo conteos: sin URLs, errores técnicos ni datos
 * del usuario.
 */
export const ShoppingSearchSummarySchema = z.object({
  mode: z.enum(["LOOK", "SLOT"]),
  /** Prendas buscadas y cuántas quedaron con al menos un producto. */
  slots: count,
  slots_with_results: count,
  /** Prendas cuya búsqueda falló entera (sin resultados por un error, no por ausencia). */
  failed_slots: z.array(GarmentSlotSchema).max(20),
  /** URLs candidatas revisadas y productos válidos encontrados (pools). */
  candidates: count,
  products: count,
  /** Productos guardados en el look (los que se muestran). */
  saved: count,
  /** De los guardados: stock sin verificar y talle del usuario sin verificar. */
  unverified_stock: count,
  unverified_sizes: count,
  /** Alguna prenda falló o volvió sin productos: la UI lo dice con honestidad. */
  partial: z.boolean(),
  /** Prendas resueltas con un pool de la cache (sin volver a buscar en las tiendas). */
  cache_hits: count,
});
export type ShoppingSearchSummary = z.infer<typeof ShoppingSearchSummarySchema>;

/**
 * Progreso de un job SEARCH_PRODUCTS (`jobs.progress`). La etapa es la de la prenda más
 * atrasada, así nunca retrocede. Sin porcentajes: etapa y prendas terminadas.
 */
export const ShoppingProgressSchema = z.object({
  stage: ShoppingStageSchema,
  slots_total: count,
  slots_done: count,
  updated_at: z.iso.datetime({ offset: true }),
  summary: ShoppingSearchSummarySchema.nullable().default(null),
});
export type ShoppingProgress = z.infer<typeof ShoppingProgressSchema>;
