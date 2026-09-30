export const DEFAULT_AFTER_LOGIN = "/app/dashboard";

/**
 * Solo permite redirecciones internas (evita open redirect): tiene que empezar con
 * "/" y no con "//" ni "/\".
 */
export function safeNextPath(value: unknown, fallback = DEFAULT_AFTER_LOGIN): string {
  if (typeof value !== "string" || value.length > 200) return fallback;
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return fallback;
  if (/[\r\n\t]/.test(value)) return fallback;
  return value;
}
