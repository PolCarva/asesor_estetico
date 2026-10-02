import { describe, expect, it } from "vitest";

import {
  APPROX_UYU_PER_USD,
  buildCartView,
  type CartLine,
  garmentSlotOrder,
  LOOSE_CART_GROUP,
} from "../src";

const NOW = new Date("2026-10-01T18:00:00Z");
const FRESH = "2026-10-01T15:00:00Z";
const STALE = "2026-10-01T08:00:00Z";

const LOOK_1 = { id: "11111111-1111-4111-8111-111111111111", name: "Smart casual", position: 1 };
const LOOK_2 = { id: "22222222-2222-4222-8222-222222222222", name: "Minimal", position: 2 };

let seq = 0;
function line(overrides: Partial<CartLine> = {}): CartLine {
  seq += 1;
  return {
    id: `item-${seq}`,
    productId: `product-${seq}`,
    title: `Producto ${seq}`,
    storeName: "Tienda",
    storeDomain: "tienda.com.uy",
    url: `https://tienda.com.uy/p/${seq}`,
    imageUrl: null,
    look: LOOK_1,
    slot: "top",
    variant: null,
    quantity: 1,
    snapshot: { amount: 1000, currency: "UYU" },
    current: { amount: 1000, currency: "UYU" },
    availability: "IN_STOCK",
    fetchedAt: FRESH,
    purchasedAt: null,
    addedAt: `2026-10-01T10:00:${String(seq % 60).padStart(2, "0")}Z`,
    ...overrides,
  };
}

describe("buildCartView: carrito agrupado por look con subtotal por moneda", () => {
  it("el ejemplo del SPEC: tres prendas de un look y TOTAL APROX. $ 5.157", () => {
    const view = buildCartView(
      [
        line({ slot: "shoes", current: { amount: 2590, currency: "UYU" } }),
        line({ slot: "top", current: { amount: 699, currency: "UYU" } }),
        line({ slot: "bottom", current: { amount: 1868, currency: "UYU" } }),
      ].map((l) => ({ ...l, snapshot: l.current! })),
      NOW,
    );
    expect(view.empty).toBe(false);
    expect(view.groups).toHaveLength(1);
    expect(view.groups[0]!.lines.map((l) => l.slot)).toEqual(["top", "bottom", "shoes"]);
    expect(view.groups[0]!.subtotals).toEqual([{ amount: 5157, currency: "UYU" }]);
    expect(view.totals.pending).toEqual([{ amount: 5157, currency: "UYU" }]);
    expect(view.totals.approx).toBeNull();
    expect(view.totals.pendingCount).toBe(3);
  });

  it("agrupa por look en orden de posición y deja los sueltos al final", () => {
    const view = buildCartView(
      [
        line({ look: null, slot: null }),
        line({ look: LOOK_2, slot: "top" }),
        line({ look: LOOK_1, slot: "accessory:1" }),
        line({ look: LOOK_1, slot: "layering:0" }),
        // Ítem de un look borrado: sin look, conserva la prenda.
        line({ look: null, slot: "shoes" }),
      ],
      NOW,
    );
    expect(view.groups.map((g) => g.key)).toEqual([LOOK_1.id, LOOK_2.id, LOOSE_CART_GROUP]);
    expect(view.groups[0]!.lines.map((l) => l.slot)).toEqual(["layering:0", "accessory:1"]);
    expect(view.groups[2]!.lines.map((l) => l.slot)).toEqual(["shoes", null]);
  });

  it("los comprados no suman a lo que falta comprar: tienen su propio total", () => {
    const view = buildCartView(
      [
        line({ current: { amount: 1399, currency: "UYU" } }),
        line({
          slot: "bottom",
          current: { amount: 1299, currency: "UYU" },
          purchasedAt: "2026-10-01T17:00:00Z",
        }),
      ],
      NOW,
    );
    expect(view.totals.pending).toEqual([{ amount: 1399, currency: "UYU" }]);
    expect(view.totals.purchased).toEqual([{ amount: 1299, currency: "UYU" }]);
    expect(view.groups[0]!.subtotals).toEqual([{ amount: 1399, currency: "UYU" }]);
    expect(view.totals).toMatchObject({ pendingCount: 1, purchasedCount: 1 });
    expect(view.groups[0]!.lines[1]!.purchased).toBe(true);
  });

  it("un producto sin precio publicado hoy queda fuera del total y se cuenta aparte", () => {
    const view = buildCartView(
      [
        line({ current: { amount: 1399, currency: "UYU" } }),
        line({ slot: "shoes", current: null, availability: "IN_STORE_ONLY" }),
      ],
      NOW,
    );
    const noPrice = view.groups[0]!.lines.find((l) => l.slot === "shoes")!;
    expect(noPrice.unitPrice).toBeNull();
    expect(noPrice.lineTotal).toBeNull();
    expect(noPrice.priceChange).toBeNull();
    expect(view.totals.pending).toEqual([{ amount: 1399, currency: "UYU" }]);
    expect(view.totals.withoutPrice).toBe(1);
  });

  it("monedas mezcladas: subtotal por moneda y un total único aprox. en pesos", () => {
    const view = buildCartView(
      [
        line({ current: { amount: 1399.5, currency: "UYU" } }),
        line({ slot: "shoes", current: { amount: 79.9, currency: "USD" } }),
      ],
      NOW,
    );
    expect(view.totals.pending).toEqual([
      { amount: 1399.5, currency: "UYU" },
      { amount: 79.9, currency: "USD" },
    ]);
    expect(view.totals.approx).toEqual({
      amount: Math.round(1399.5 + 79.9 * APPROX_UYU_PER_USD),
      currency: "UYU",
    });
  });

  it("suma con cantidades y sin errores de coma flotante", () => {
    const view = buildCartView(
      [
        line({ current: { amount: 0.1, currency: "UYU" }, quantity: 3 }),
        line({ slot: "bottom", current: { amount: 0.2, currency: "UYU" } }),
      ],
      NOW,
    );
    expect(view.groups[0]!.lines[0]!.lineTotal).toEqual({ amount: 0.3, currency: "UYU" });
    expect(view.totals.pending).toEqual([{ amount: 0.5, currency: "UYU" }]);
  });

  it("avisa si el precio cambió desde que se agregó y cuenta el actual", () => {
    const view = buildCartView(
      [
        line({
          snapshot: { amount: 1499, currency: "UYU" },
          current: { amount: 1299, currency: "UYU" },
        }),
      ],
      NOW,
    );
    const [item] = view.groups[0]!.lines;
    expect(item!.priceChange).toEqual({
      from: { amount: 1499, currency: "UYU" },
      to: { amount: 1299, currency: "UYU" },
    });
    expect(view.totals.pending).toEqual([{ amount: 1299, currency: "UYU" }]);
  });

  it("marca los datos de más de 8 h para revalidar antes de comprar", () => {
    const view = buildCartView(
      [line({ fetchedAt: STALE }), line({ slot: "bottom", fetchedAt: FRESH })],
      NOW,
    );
    expect(view.groups[0]!.lines.map((l) => l.stale)).toEqual([true, false]);
  });

  it("carrito vacío", () => {
    const view = buildCartView([], NOW);
    expect(view).toMatchObject({ empty: true, groups: [] });
    expect(view.totals).toMatchObject({ pending: [], purchased: [], approx: null });
  });

  it("orden de prendas como en el look", () => {
    const slots = ["accessory:0", "shoes", "layering:2", "bottom", "top", null] as const;
    expect([...slots].sort((a, b) => garmentSlotOrder(a) - garmentSlotOrder(b))).toEqual([
      "top",
      "bottom",
      "layering:2",
      "shoes",
      "accessory:0",
      null,
    ]);
  });
});
