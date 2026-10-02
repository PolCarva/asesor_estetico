import { describe, expect, it } from "vitest";

import { cartChangeNotices } from "./cart-notices";

const spaces = (list: string[]) => list.map((s) => s.replace(/\s/g, " "));

describe("cartChangeNotices: avisos honestos del carrito", () => {
  it("sin cambios ni dudas: ningún aviso", () => {
    expect(
      cartChangeNotices({ priceChange: null, revalidation: "fresh", availability: "IN_STOCK" }),
    ).toEqual([]);
    expect(
      cartChangeNotices({ priceChange: null, revalidation: "verified", availability: "IN_STOCK" }),
    ).toEqual([]);
  });

  it("precio que cambió al revalidar, con la moneda real", () => {
    expect(
      spaces(
        cartChangeNotices({
          priceChange: {
            from: { amount: 1499, currency: "UYU" },
            to: { amount: 1299, currency: "UYU" },
          },
          revalidation: "verified",
          availability: "IN_STOCK",
        }),
      ),
    ).toEqual(["El precio cambió: antes $ 1.499, ahora $ 1.299."]);
  });

  it("sin verificación: lo dice, y no sostiene el stock viejo", () => {
    expect(
      cartChangeNotices({ priceChange: null, revalidation: "pending", availability: "UNKNOWN" }),
    ).toEqual([
      "No pudimos verificar el precio y el stock ahora: quedó con el último dato que tenemos. Confirmalo en la tienda antes de comprar.",
    ]);
    expect(
      cartChangeNotices({ priceChange: null, revalidation: "unverified", availability: "UNKNOWN" }),
    ).toEqual(["No pudimos verificar el stock con la tienda: confirmalo antes de comprar."]);
  });

  it("talle agotado", () => {
    expect(
      cartChangeNotices({ priceChange: null, revalidation: "fresh", availability: "OUT_OF_STOCK" }),
    ).toEqual(["Figura agotado en la tienda."]);
  });
});
