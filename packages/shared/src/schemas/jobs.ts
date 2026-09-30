import { z } from "zod";

import { UserPhotoTypeSchema } from "./photos";
import { ShoppingQuerySchema } from "./products";

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
  SEARCH_PRODUCTS: z.object({
    user_id: z.uuid(),
    look_id: z.uuid(),
    slot: z.string().max(20),
    query: ShoppingQuerySchema,
  }),
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
