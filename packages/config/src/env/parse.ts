import type { z } from "zod";

export type EnvSource = Record<string, string | undefined>;

/**
 * Valida variables de entorno. El error lista solo los nombres de las
 * variables inválidas, nunca sus valores.
 */
export function parseEnv<T extends z.ZodType>(
  schema: T,
  source: EnvSource,
  scope: string,
): z.infer<T> {
  // Las variables vacías cuentan como ausentes (así los defaults y .optional() aplican).
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value !== ""),
  );
  const result = schema.safeParse(cleaned);
  if (!result.success) {
    const keys = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))];
    throw new Error(
      `[env:${scope}] Variables de entorno inválidas o faltantes: ${keys.join(", ")}. Revisá .env (ver .env.example).`,
    );
  }
  return result.data;
}
