import { describe, expect, it } from "vitest";

import { cartChangeNotices, lookCartSummary } from "./cart-notices";

const spaces = (list: string[]) => list.map((s) => s.replace(/\s/g, " "));

const base = {
  priceChange: null,
  price: { amount: 1299, currency: "UYU" },
  listedPrice: { amount: 1299, currency: "UYU" },
  variant: { size: "M", color: null },
} as const;

describe("cartChangeNotices: avisos honestos del carrito", () => {
  it("el talle elegido cuesta otra cosa que lo que se mostraba (otro color): lo dice", () => {
    expect(
      spaces(
        cartChangeNotices({
          ...base,
          price: { amount: 4090, currency: "UYU" },
          listedPrice: { amount: 2813, currency: "UYU" },
          variant: { size: "42", color: "azul" },
          revalidation: "verified",
          availability: "IN_STOCK",
        }),
      ),
    ).toEqual(["En el talle 42 (azul) cuesta $ 4.090; en la búsqueda figuraba $ 2.813."]);
  });

  it("sin cambios ni dudas: ningún aviso", () => {
    expect(cartChangeNotices({ ...base, revalidation: "fresh", availability: "IN_STOCK" })).toEqual(
      [],
    );
    expect(
      cartChangeNotices({ ...base, revalidation: "verified", availability: "IN_STOCK" }),
    ).toEqual([]);
  });

  it("precio que cambió al revalidar, con la moneda real", () => {
    expect(
      spaces(
        cartChangeNotices({
          ...base,
          priceChange: {
            from: { amount: 1499, currency: "UYU" },
            to: { amount: 1299, currency: "UYU" },
          },
          listedPrice: { amount: 1499, currency: "UYU" },
          revalidation: "verified",
          availability: "IN_STOCK",
        }),
      ),
    ).toEqual(["El precio cambió: antes $ 1.499, ahora $ 1.299."]);
  });

  it("sin verificación: lo dice, y no sostiene el stock viejo", () => {
    expect(
      cartChangeNotices({ ...base, revalidation: "pending", availability: "UNKNOWN" }),
    ).toEqual([
      "No pudimos verificar el precio y el stock ahora: quedó con el último dato que tenemos. Confirmalo en la tienda antes de comprar.",
    ]);
    expect(
      cartChangeNotices({ ...base, revalidation: "unverified", availability: "UNKNOWN" }),
    ).toEqual(["No pudimos verificar el stock con la tienda: confirmalo antes de comprar."]);
  });

  it("talle agotado", () => {
    expect(
      cartChangeNotices({ ...base, revalidation: "fresh", availability: "OUT_OF_STOCK" }),
    ).toEqual(["Figura agotado en la tienda."]);
  });
});

describe("lookCartSummary: agregar el look completo", () => {
  const added = (overrides: Record<string, unknown> = {}) =>
    ({
      itemId: "i",
      productId: "p",
      storeDomain: "tienda.com.uy",
      lookId: "l",
      slot: "top",
      variantId: null,
      price: { amount: 1000, currency: "UYU" },
      priceChange: null,
      revalidation: "fresh",
      availability: "IN_STOCK",
      listedPrice: { amount: 1000, currency: "UYU" },
      variant: null,
      cartId: "c",
      alreadyInCart: false,
      ...overrides,
    }) as const;

  it("cuenta las prendas agregadas y avisa lo que cambió, lo que no se verificó y lo que no entró", () => {
    const summary = lookCartSummary({
      added: [
        added(),
        added({
          slot: "bottom",
          priceChange: {
            from: { amount: 1499, currency: "UYU" },
            to: { amount: 1299, currency: "UYU" },
          },
        }),
        added({ slot: "shoes", revalidation: "pending", availability: "UNKNOWN" }),
        added({ slot: "layering:0", alreadyInCart: true }),
        added({
          slot: "accessory:2",
          price: { amount: 4090, currency: "UYU" },
          listedPrice: { amount: 2813, currency: "UYU" },
        }),
      ],
      present: [{ slot: "accessory:3", productId: "z" }],
      skipped: [
        { slot: "accessory:0", productId: "x", reason: "NO_PRICE" },
        { slot: "accessory:1", productId: "y", reason: "PRODUCT_GONE" },
      ],
    });
    expect(summary).toEqual({
      message: "Agregamos 4 prendas al carrito.",
      notices: [
        "En 1 prenda tu talle cuesta distinto de lo que se mostraba: lo ves en el carrito.",
        "Cambió el precio de 1 prenda desde la búsqueda: el carrito tiene el de hoy.",
        "No pudimos verificar el precio o el stock de 1 prenda: confirmalo en la tienda.",
        "1 prenda se consigue en el local y no tiene precio publicado: no se suma al carrito.",
        "1 prenda ya no está publicada en la tienda.",
      ],
    });
  });

  it("si ya estaba todo, lo dice", () => {
    expect(
      lookCartSummary({ added: [], present: [{ slot: "top", productId: "p" }], skipped: [] }),
    ).toEqual({
      message: "Ya estaba todo en tu carrito.",
      notices: [],
    });
  });
});
