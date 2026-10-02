import {
  type AddLookToCartResult,
  type CartChangeResult,
  NO_PRICE,
  PRODUCT_GONE,
} from "@asesor/db";
import type { Money } from "@asesor/shared";

import { formatMoney } from "./look-results";

const sameMoney = (a: Money, b: Money) =>
  a.currency === b.currency && Math.round(a.amount * 100) === Math.round(b.amount * 100);

/** "el talle 42 (azul)", "el talle M", o null si no hay talle. */
function variantText(variant: CartChangeResult["variant"]): string | null {
  if (!variant?.size) return null;
  return variant.color ? `el talle ${variant.size} (${variant.color})` : `el talle ${variant.size}`;
}

/**
 * Avisos honestos después de agregar, cambiar el talle o cambiar por otra alternativa
 * (pasos 10a y 10b): si el precio cambió, si el talle elegido cuesta otra cosa que lo que se
 * mostraba, si no se pudo verificar con la tienda y si figura agotado. Nunca errores técnicos.
 */
export function cartChangeNotices(
  result: Pick<
    CartChangeResult,
    "priceChange" | "revalidation" | "availability" | "price" | "listedPrice" | "variant"
  >,
): string[] {
  const notices: string[] = [];
  if (result.priceChange) {
    notices.push(
      `El precio cambió: antes ${formatMoney(result.priceChange.from)}, ahora ${formatMoney(result.priceChange.to)}.`,
    );
  }
  // El talle elegido cuesta otra cosa que el precio que se mostraba (otro color u otra variante).
  const listed = result.listedPrice;
  if (
    listed &&
    !sameMoney(listed, result.price) &&
    !(result.priceChange && sameMoney(result.priceChange.from, listed))
  ) {
    const where = variantText(result.variant);
    notices.push(
      `${where ? `En ${where}` : "En el carrito"} cuesta ${formatMoney(result.price)}; en la búsqueda figuraba ${formatMoney(listed)}.`,
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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Resultado de "Agregar el look al carrito", contado por prenda y sin detalles técnicos. */
export function lookCartSummary(result: AddLookToCartResult): {
  message: string;
  notices: string[];
} {
  const fresh = result.added.filter((a) => !a.alreadyInCart).length;
  const message =
    fresh > 0
      ? `Agregamos ${plural(fresh, "prenda", "prendas")} al carrito.`
      : result.added.length > 0 || result.present.length > 0
        ? "Ya estaba todo en tu carrito."
        : "No pudimos agregar ninguna prenda.";
  const notices: string[] = [];
  const otherPrice = result.added.filter(
    (a) =>
      a.listedPrice &&
      !sameMoney(a.listedPrice, a.price) &&
      !(a.priceChange && sameMoney(a.priceChange.from, a.listedPrice)),
  ).length;
  if (otherPrice) {
    notices.push(
      otherPrice === 1
        ? "En 1 prenda tu talle cuesta distinto de lo que se mostraba: lo ves en el carrito."
        : `En ${otherPrice} prendas tu talle cuesta distinto de lo que se mostraba: lo ves en el carrito.`,
    );
  }
  const changed = result.added.filter((a) => a.priceChange).length;
  if (changed) {
    notices.push(
      `Cambió el precio de ${plural(changed, "prenda", "prendas")} desde la búsqueda: el carrito tiene el de hoy.`,
    );
  }
  const unverified = result.added.filter(
    (a) => a.revalidation === "pending" || a.revalidation === "unverified",
  ).length;
  if (unverified) {
    notices.push(
      `No pudimos verificar el precio o el stock de ${plural(unverified, "prenda", "prendas")}: confirmalo en la tienda.`,
    );
  }
  const local = result.skipped.filter((s) => s.reason === NO_PRICE).length;
  if (local) {
    notices.push(
      local === 1
        ? "1 prenda se consigue en el local y no tiene precio publicado: no se suma al carrito."
        : `${local} prendas se consiguen en el local y no tienen precio publicado: no se suman al carrito.`,
    );
  }
  const gone = result.skipped.filter((s) => s.reason === PRODUCT_GONE).length;
  const other = result.skipped.length - local - gone;
  if (gone) {
    notices.push(
      `${plural(gone, "prenda ya no está publicada", "prendas ya no están publicadas")} en la tienda.`,
    );
  }
  if (other) notices.push(`No pudimos agregar ${plural(other, "prenda", "prendas")}.`);
  return { message, notices };
}
