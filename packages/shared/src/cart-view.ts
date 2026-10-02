import { APPROX_UYU_PER_USD } from "./constants";
import { type Currency, CurrencySchema, type Money } from "./schemas/common";
import type { GarmentSlot } from "./schemas/look-spec";
import { isProductStale, type ProductAvailability } from "./schemas/products";

/**
 * View model del carrito (paso 10a, D18): agrupa por look y prenda, y calcula el subtotal
 * por moneda. Puro: los datos los arma `getCartLines` (`@asesor/db`) y la UI (paso 10b) solo
 * los muestra.
 *
 * Reglas:
 * - el precio que cuenta es el actual del catálogo (variante o producto); si cambió desde que
 *   se agregó, se avisa con el de antes;
 * - un ítem que hoy no tiene precio publicado queda fuera del total (se cuenta aparte);
 * - lo marcado como comprado no suma a lo que falta comprar: tiene su propio total;
 * - nunca se suman monedas distintas; el total único "aprox." en pesos solo aparece con
 *   monedas mezcladas, con la conversión aproximada.
 */

/** Ítem del carrito con los datos actuales del catálogo. */
export interface CartLine {
  id: string;
  productId: string;
  title: string;
  storeName: string;
  storeDomain: string;
  url: string;
  imageUrl: string | null;
  /** Look del ítem; null: producto suelto o de un look que ya no existe. */
  look: { id: string; name: string | null; position: number | null } | null;
  slot: GarmentSlot | null;
  variant: { id: string; size: string | null } | null;
  quantity: number;
  /** Precio que fijó la base al agregar (o al cambiar el producto o el talle). */
  snapshot: Money;
  /** Precio actual del catálogo; null: hoy no tiene precio publicado. */
  current: Money | null;
  availability: ProductAvailability;
  /** Última verificación del producto contra la tienda. */
  fetchedAt: string;
  purchasedAt: string | null;
  addedAt: string;
}

export interface CartLineView extends CartLine {
  /** Precio que cuenta para el total; null: sin precio publicado hoy (fuera del total). */
  unitPrice: Money | null;
  lineTotal: Money | null;
  /** El precio cambió desde que se agregó. */
  priceChange: { from: Money; to: Money } | null;
  /** Dato de más de 8 h: se revalida antes de comprar. */
  stale: boolean;
  purchased: boolean;
}

export interface CartGroup {
  /** id del look, o `loose` para los productos sin look. */
  key: string;
  look: CartLine["look"];
  lines: CartLineView[];
  /** Lo que falta comprar del grupo, por moneda. */
  subtotals: Money[];
}

export interface CartTotals {
  /** Lo que falta comprar, por moneda. */
  pending: Money[];
  /** Lo marcado como comprado, por moneda. */
  purchased: Money[];
  /** Total único aproximado en pesos: solo si lo pendiente mezcla monedas. */
  approx: Money | null;
  pendingCount: number;
  purchasedCount: number;
  /** Pendientes sin precio publicado hoy: quedan fuera del total. */
  withoutPrice: number;
}

export interface CartView {
  groups: CartGroup[];
  totals: CartTotals;
  empty: boolean;
}

export const LOOSE_CART_GROUP = "loose";

// Montos en centésimos para que la suma no arrastre errores de coma flotante.
const cents = (amount: number) => Math.round(amount * 100);

function sumByCurrency(amounts: Money[]): Money[] {
  const byCurrency = new Map<Currency, number>();
  for (const money of amounts) {
    byCurrency.set(money.currency, (byCurrency.get(money.currency) ?? 0) + cents(money.amount));
  }
  return CurrencySchema.options
    .filter((currency) => byCurrency.has(currency))
    .map((currency) => ({ currency, amount: byCurrency.get(currency)! / 100 }));
}

function sameMoney(a: Money, b: Money): boolean {
  return a.currency === b.currency && cents(a.amount) === cents(b.amount);
}

/** Orden de las prendas como en el look: arriba, abajo, capas, calzado, accesorios. */
export function garmentSlotOrder(slot: GarmentSlot | null): number {
  if (!slot) return 99;
  const [kind, index] = slot.split(":");
  const base = { top: 0, bottom: 1, layering: 2, shoes: 5, accessory: 6 }[kind ?? ""] ?? 98;
  return base + Number(index ?? 0);
}

function lineView(line: CartLine, now: Date): CartLineView {
  const unitPrice = line.current;
  return {
    ...line,
    unitPrice,
    lineTotal: unitPrice
      ? { currency: unitPrice.currency, amount: (cents(unitPrice.amount) * line.quantity) / 100 }
      : null,
    priceChange:
      unitPrice && !sameMoney(unitPrice, line.snapshot)
        ? { from: line.snapshot, to: unitPrice }
        : null,
    stale: isProductStale(line.fetchedAt, now),
    purchased: line.purchasedAt !== null,
  };
}

const pendingTotals = (lines: CartLineView[]) =>
  sumByCurrency(lines.flatMap((l) => (!l.purchased && l.lineTotal ? [l.lineTotal] : [])));

export function buildCartView(lines: CartLine[], now: Date = new Date()): CartView {
  const views = lines.map((line) => lineView(line, now));

  const groups = new Map<string, CartGroup>();
  for (const line of views) {
    const key = line.look?.id ?? LOOSE_CART_GROUP;
    const group = groups.get(key) ?? { key, look: line.look, lines: [], subtotals: [] };
    group.lines.push(line);
    groups.set(key, group);
  }
  const ordered = [...groups.values()]
    .map((group) => ({
      ...group,
      lines: group.lines.sort(
        (a, b) =>
          garmentSlotOrder(a.slot) - garmentSlotOrder(b.slot) || a.addedAt.localeCompare(b.addedAt),
      ),
      subtotals: pendingTotals(group.lines),
    }))
    .sort((a, b) => {
      // Looks por posición (los de posición desconocida después) y los sueltos al final.
      if (a.key === LOOSE_CART_GROUP || b.key === LOOSE_CART_GROUP) {
        return Number(a.key === LOOSE_CART_GROUP) - Number(b.key === LOOSE_CART_GROUP);
      }
      return (a.look?.position ?? 99) - (b.look?.position ?? 99) || a.key.localeCompare(b.key);
    });

  const pendingLines = views.filter((l) => !l.purchased);
  const pending = pendingTotals(views);
  const approx =
    pending.length > 1
      ? {
          currency: "UYU" as const,
          amount: Math.round(
            pending.reduce(
              (sum, m) => sum + (m.currency === "USD" ? m.amount * APPROX_UYU_PER_USD : m.amount),
              0,
            ),
          ),
        }
      : null;

  return {
    groups: ordered,
    totals: {
      pending,
      purchased: sumByCurrency(
        views.flatMap((l) => (l.purchased && l.lineTotal ? [l.lineTotal] : [])),
      ),
      approx,
      pendingCount: pendingLines.length,
      purchasedCount: views.length - pendingLines.length,
      withoutPrice: pendingLines.filter((l) => l.unitPrice === null).length,
    },
    empty: views.length === 0,
  };
}
