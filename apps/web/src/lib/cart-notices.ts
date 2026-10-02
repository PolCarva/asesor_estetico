import type { CartChangeResult } from "@asesor/db";

import { formatMoney } from "./look-results";

/**
 * Avisos honestos después de agregar, cambiar el talle o cambiar por otra alternativa
 * (paso 10a): si el precio cambió, si no se pudo verificar con la tienda y si el talle figura
 * agotado. Nunca errores técnicos.
 */
export function cartChangeNotices(
  result: Pick<CartChangeResult, "priceChange" | "revalidation" | "availability">,
): string[] {
  const notices: string[] = [];
  if (result.priceChange) {
    notices.push(
      `El precio cambió: antes ${formatMoney(result.priceChange.from)}, ahora ${formatMoney(result.priceChange.to)}.`,
    );
  }
  if (result.revalidation === "pending") {
    notices.push(
      "No pudimos verificar el precio y el stock ahora: quedó con el último dato que tenemos. Confirmalo en la tienda antes de comprar.",
    );
  } else if (result.revalidation === "unverified") {
    notices.push("No pudimos verificar el stock con la tienda: confirmalo antes de comprar.");
  } else if (result.availability === "OUT_OF_STOCK") {
    notices.push("Figura agotado en la tienda.");
  }
  return notices;
}
