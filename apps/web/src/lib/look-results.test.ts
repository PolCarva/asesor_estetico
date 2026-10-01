import type { LookProductResult } from "@asesor/db";
import { EMPTY_USER_SIZES, listLookGarments, type Product, type SizeStatus } from "@asesor/shared";
import {
  FIXTURE_IN_STORE_PRODUCT,
  FIXTURE_LOOK_SPECS,
  FIXTURE_PRODUCTS,
} from "@asesor/shared/fixtures";
import { describe, expect, it } from "vitest";

import { buildLookResults, formatMoney, sizeBadge, timeAgo } from "./look-results";

const NOW = new Date("2026-10-01T15:00:00.000Z");
const HOURS = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();
const spaces = (s: string | null | undefined) => s?.replace(/\s/g, " ");

const pieces = listLookGarments(FIXTURE_LOOK_SPECS[0]);
const sizes = { ...EMPTY_USER_SIZES, top: "M", bottom: "32", shoe: "42" };

const SEARCHED: Record<string, string | null> = { top: "M", bottom: "32", shoes: "42" };

function row(
  slot: string,
  rank: number,
  product: Product,
  sizeStatus: SizeStatus | null = "AVAILABLE",
  fetchedHoursAgo = 1,
  userSize: string | null = SEARCHED[slot] ?? null,
): LookProductResult {
  return {
    slot,
    rank,
    score: 0.9 - rank / 10,
    breakdown: {},
    sizeStatus,
    userSize,
    list: "MAIN",
    cheaperThan: null,
    product: {
      id: `${slot}-${rank}`,
      product: { ...product, fetched_at: HOURS(fetchedHoursAgo) },
    },
  };
}

const [crudo, blanca, chino, overshirt, boots] = FIXTURE_PRODUCTS;

describe("buildLookResults", () => {
  it("agrupa por prenda en el orden del look: recomendado (rank 1) + alternativas", () => {
    const view = buildLookResults({
      pieces,
      rows: [
        row("top", 2, blanca!, "UNVERIFIED"),
        row("top", 1, crudo!),
        row("top", 3, { ...blanca!, url: `${blanca!.url}-b` }, "OUT_OF_STOCK"),
        row("bottom", 1, chino!),
      ],
      summary: null,
      sizes,
      now: NOW,
    });
    expect(view.pieces.map((p) => [p.slot, p.status])).toEqual([
      ["top", "results"],
      ["bottom", "results"],
      ["layering:0", "empty"],
      ["shoes", "empty"],
      ["accessory:0", "empty"],
    ]);
    const top = view.pieces[0]!;
    expect(top.recommended).toMatchObject({ productId: "top-1", title: crudo!.title });
    expect(top.alternatives.map((a) => a.productId)).toEqual(["top-2", "top-3"]);
    expect(top.recommended?.size).toEqual({ label: "Talle M ✓", tone: "ok" });
    expect(top.alternatives.map((a) => a.size?.label)).toEqual([
      "Talle sin verificar",
      "Talle M agotado",
    ]);
    expect(view.withResults).toBe(2);
  });

  it("precio en su moneda real; el total solo suma recomendados de una misma moneda", () => {
    const uyu = buildLookResults({
      pieces,
      rows: [row("top", 1, crudo!), row("bottom", 1, chino!)],
      summary: null,
      sizes,
      now: NOW,
    });
    expect(spaces(uyu.pieces[0]!.recommended?.price)).toBe("$ 1.890");
    expect(uyu.totals.map((t) => [spaces(t.amount), t.count])).toEqual([["$ 4.180", 2]]);
    expect(uyu.complete).toBe(true);

    // Una prenda en dólares: subtotales por moneda, nunca convertidos.
    const mixed = buildLookResults({
      pieces,
      rows: [
        row("top", 1, crudo!),
        row("layering:0", 1, { ...overshirt!, availability: "IN_STOCK" }),
      ],
      summary: null,
      sizes,
      now: NOW,
    });
    expect(mixed.totals.map((t) => spaces(t.amount))).toEqual(["$ 1.890", "US$ 79"]);
    expect(mixed.complete).toBe(false);
  });

  it("local físico sin precio: 'a consultar', con su ubicación, y fuera del total", () => {
    const view = buildLookResults({
      pieces,
      rows: [
        row("top", 1, crudo!),
        row("accessory:0", 1, FIXTURE_IN_STORE_PRODUCT, "NOT_APPLICABLE"),
      ],
      summary: null,
      sizes,
      now: NOW,
    });
    const store = view.pieces.find((p) => p.slot === "accessory:0")!.recommended!;
    expect(store.price).toBeNull();
    expect(store.stock).toEqual({ label: "Disponible en tienda física", tone: "muted" });
    expect(store.size).toBeNull();
    expect(store.inStore?.address).toBe(FIXTURE_IN_STORE_PRODUCT.in_store?.address);
    expect(view.totals.map((t) => t.count)).toEqual([1]);
    expect(view.complete).toBe(false);
  });

  it("una prenda que falló se distingue de una sin opciones", () => {
    const view = buildLookResults({
      pieces,
      rows: [row("top", 1, crudo!)],
      summary: {
        mode: "LOOK",
        slots: 5,
        slots_with_results: 1,
        failed_slots: ["shoes"],
        candidates: 20,
        products: 10,
        saved: 1,
        unverified_stock: 0,
        unverified_sizes: 0,
        partial: true,
        cache_hits: 0,
      },
      sizes,
      now: NOW,
    });
    expect(view.pieces.find((p) => p.slot === "shoes")?.status).toBe("failed");
    expect(view.pieces.find((p) => p.slot === "bottom")?.status).toBe("empty");
  });

  it("stock honesto, fecha de verificación y aviso de datos viejos (más de 8 h)", () => {
    const view = buildLookResults({
      pieces,
      rows: [row("top", 1, crudo!, "AVAILABLE", 2), row("shoes", 1, boots!, "UNVERIFIED", 9)],
      summary: null,
      sizes,
      now: NOW,
    });
    expect(view.pieces[0]!.recommended).toMatchObject({ verified: "hace 2 h", stale: false });
    const shoes = view.pieces.find((p) => p.slot === "shoes")!.recommended!;
    expect(shoes).toMatchObject({ verified: "hace 9 h", stale: true });
    expect(shoes.stock).toEqual({ label: "Stock sin verificar", tone: "muted" });
    expect(view.stale).toBe(true);
    expect(view.oldestVerified).toBe("hace 9 h");
  });

  it("el talle es el de la búsqueda; si el perfil cambió después, lo avisa", () => {
    const same = buildLookResults({
      pieces,
      rows: [row("top", 1, crudo!), row("shoes", 1, boots!)],
      summary: null,
      sizes,
      now: NOW,
    });
    expect(same.sizesChanged).toBe(false);
    const changed = buildLookResults({
      pieces,
      rows: [row("top", 1, crudo!), row("shoes", 1, boots!)],
      summary: null,
      sizes: { ...sizes, shoe: "10", shoe_size_system: "US" },
      now: NOW,
    });
    expect(changed.pieces.find((p) => p.slot === "shoes")?.recommended?.size?.label).toBe(
      "Talle 42 ✓",
    );
    expect(changed.sizesChanged).toBe(true);
    // Filas anteriores (sin talle guardado): estado sin número, y sin aviso.
    const legacy = buildLookResults({
      pieces,
      rows: [row("top", 1, crudo!, "AVAILABLE", 1, null)],
      summary: null,
      sizes: { ...sizes, top: "L" },
      now: NOW,
    });
    expect(legacy.pieces[0]!.recommended?.size?.label).toBe("Tu talle ✓");
    expect(legacy.sizesChanged).toBe(false);
  });

  it("solo usa fotos https", () => {
    const view = buildLookResults({
      pieces,
      rows: [
        row("top", 1, { ...crudo!, image_url: "http://tienda.test/a.jpg" }),
        row("top", 2, { ...blanca!, image_url: "https://tienda.test/b.jpg" }),
      ],
      summary: null,
      sizes,
      now: NOW,
    });
    expect(view.pieces[0]!.recommended?.imageUrl).toBeNull();
    expect(view.pieces[0]!.alternatives[0]?.imageUrl).toBe("https://tienda.test/b.jpg");
  });
});

describe("más baratas (paso 09)", () => {
  const cheap = (
    rank: number,
    product: Product,
    max = { amount: 1890, currency: "UYU" as const },
  ): LookProductResult => ({
    ...row("top", rank, product),
    product: { id: `cheap-${rank}`, product: { ...product, fetched_at: HOURS(1) } },
    list: "CHEAPER",
    cheaperThan: { productId: "top-1", maxPrice: max },
  });

  it("van aparte del ranking, con el precio de referencia y cuánto menos cuestan", () => {
    const view = buildLookResults({
      pieces,
      rows: [
        row("top", 1, crudo!),
        row("top", 2, blanca!),
        cheap(1, {
          ...blanca!,
          url: "https://otra.test/a",
          price: { amount: 990, currency: "UYU" },
        }),
        cheap(2, {
          ...blanca!,
          url: "https://otra.test/b",
          price: { amount: 30, currency: "USD" },
        }),
      ],
      summary: null,
      sizes,
      now: NOW,
    });
    const top = view.pieces[0]!;
    expect(top.alternatives.map((a) => a.productId)).toEqual(["top-2"]);
    expect(top.cheaper).toMatchObject({
      state: "results",
      referenceTitle: crudo!.title,
      converted: true,
    });
    expect(spaces(top.cheaper.limit)).toBe("$ 1.890");
    expect(top.cheaper.options.map((o) => [spaces(o.price), spaces(o.saving)])).toEqual([
      ["$ 990", "$ 900 menos"],
      // En dólares: sin diferencia (no se convierte para mostrar).
      ["US$ 30", undefined],
    ]);
    // El total sigue siendo el de los recomendados del ranking principal.
    expect(view.totals.map((t) => spaces(t.amount))).toEqual(["$ 1.890"]);
  });

  it("estado honesto: buscando, sin resultados y búsquedas que ya no valen", () => {
    const base = { pieces, rows: [row("top", 1, crudo!)], summary: null, sizes, now: NOW };
    const at = (h: number) => HOURS(h);
    const state = (
      search: { status: "QUEUED" | "RUNNING" | "COMPLETED" | "FAILED"; createdAt: string },
      look: string | null,
    ) =>
      buildLookResults({
        ...base,
        slotSearches: new Map([["top", search]]),
        lookSearchCreatedAt: look,
      }).pieces[0]!.cheaper.state;
    expect(state({ status: "RUNNING", createdAt: at(0) }, at(1))).toBe("running");
    expect(state({ status: "COMPLETED", createdAt: at(0) }, at(1))).toBe("empty");
    expect(state({ status: "FAILED", createdAt: at(0) }, at(1))).toBe("failed");
    // Una búsqueda del look más nueva descartó esas más baratas.
    expect(state({ status: "COMPLETED", createdAt: at(2) }, at(1))).toBe("none");
    expect(buildLookResults(base).pieces[0]!.cheaper.state).toBe("none");
  });
});

describe("textos", () => {
  it("talle del usuario según el estado guardado", () => {
    expect(sizeBadge("NOT_OFFERED", "42")).toEqual({ label: "No hay talle 42", tone: "warn" });
    expect(sizeBadge("NOT_REQUESTED", null)).toEqual({ label: "Talle sin cargar", tone: "muted" });
    expect(sizeBadge(null, "M")?.label).toBe("Talle sin verificar");
    expect(sizeBadge("AVAILABLE", "US 10")?.label).toBe("Talle US 10 ✓");
  });

  it("moneda y tiempo", () => {
    expect(spaces(formatMoney({ amount: 249.9, currency: "UYU" }))).toBe("$ 249,90");
    expect(spaces(formatMoney({ amount: 79, currency: "USD" }))).toBe("US$ 79");
    expect(timeAgo(NOW.toISOString(), NOW)).toBe("recién");
    expect(timeAgo(HOURS(0.5), NOW)).toBe("hace 30 min");
    expect(timeAgo(HOURS(30), NOW)).toBe("hace 1 día");
  });
});
