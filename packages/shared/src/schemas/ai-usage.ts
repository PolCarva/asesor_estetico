import { z } from "zod";

export const AIOperationSchema = z.enum([
  "VALIDATE_PHOTOS",
  "ANALYZE_STYLE_PROFILE",
  "GENERATE_LOOK_SPECS",
  "GENERATE_LOOK_IMAGE",
  "CHAT",
  /** Búsqueda web del descubrimiento de tiendas (shopping, paso 06). */
  "WEB_SEARCH",
]);
export type AIOperation = z.infer<typeof AIOperationSchema>;

export const AIUsageRecordSchema = z.object({
  user_id: z.uuid().nullable(),
  job_id: z.uuid().nullable(),
  operation: AIOperationSchema,
  provider: z.string().min(1).max(40),
  model: z.string().min(1).max(80),
  input_tokens: z.number().int().nonnegative(),
  output_tokens: z.number().int().nonnegative(),
  image_count: z.number().int().nonnegative(),
  estimated_cost_usd: z.number().nonnegative(),
  duration_ms: z.number().int().nonnegative(),
  success: z.boolean(),
  metadata: z.record(z.string(), z.unknown()),
});
export type AIUsageRecord = z.infer<typeof AIUsageRecordSchema>;
