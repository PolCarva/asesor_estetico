import { AppError } from "@asesor/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Actions del carrito y de guardados (paso 10a): capas finas sobre `@asesor/db`. Se prueba lo
 * que agregan: Premium en el servidor (paywall, sin llamar a la lógica), Zod, mensajes
 * humanos y los eventos de analytics, que salen de acá (D20).
 */

const db = vi.hoisted(() => ({
  requirePremium: vi.fn(),
  requireAuth: vi.fn(),
  addToCart: vi.fn(),
  removeFromCart: vi.fn(),
  selectCartItemVariant: vi.fn(),
  swapCartItem: vi.fn(),
  setCartItemPurchased: vi.fn(),
  waitForProductRefresh: vi.fn(),
  saveFavorite: vi.fn(),
  removeFavorite: vi.fn(),
}));
const trackEvent = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());
const service = vi.hoisted(() => ({ service: true }));

vi.mock("@asesor/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@asesor/db")>()),
  ...db,
}));
vi.mock("@asesor/db/server", () => ({ createServerSupabaseClient: async () => ({}) }));
vi.mock("@asesor/db/service", () => ({ getServiceRoleClient: () => service }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("@/lib/analytics", () => ({ getAnalytics: () => ({ trackEvent }) }));

const { addToCartAction, removeFromCartAction, setCartItemPurchasedAction, swapCartItemAction } =
  await import("./actions");
const { removeFavoriteAction, saveFavoriteAction } = await import("../favorites/actions");

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const PRODUCT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const LOOK = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const ITEM = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const OTHER = "eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const idle = { status: "idle" } as const;

const change = {
  itemId: ITEM,
  productId: PRODUCT,
  storeDomain: "tienda.com.uy",
  lookId: LOOK,
  slot: "top",
  variantId: null,
  price: { amount: 1299, currency: "UYU" },
  priceChange: null,
  revalidation: "fresh",
  availability: "IN_STOCK",
};

const premiumRequired = () => new AppError("PREMIUM_REQUIRED", "Esta función es Premium.");

beforeEach(() => {
  vi.clearAllMocks();
  db.requirePremium.mockResolvedValue({ id: USER });
  db.requireAuth.mockResolvedValue({ id: USER });
});

describe("addToCartAction", () => {
  const fields = { productId: PRODUCT, lookId: LOOK, slot: "top", variantId: "" };

  it("free (o Premium vencido): paywall, sin tocar el carrito ni emitir eventos", async () => {
    db.requirePremium.mockRejectedValue(premiumRequired());
    expect(await addToCartAction(idle, form(fields))).toEqual({ status: "paywall" });
    expect(db.addToCart).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("agrega, emite product_added_to_cart desde el servidor y avisa si cambió el precio", async () => {
    db.addToCart.mockResolvedValue({
      ...change,
      cartId: OTHER,
      alreadyInCart: false,
      revalidation: "verified",
      priceChange: { from: { amount: 1499, currency: "UYU" }, to: change.price },
    });
    const state = await addToCartAction(idle, form(fields));
    expect(state).toMatchObject({ status: "done", message: "Agregado al carrito.", itemId: ITEM });
    expect(state.status === "done" && state.notices[0]?.replace(/\s/g, " ")).toBe(
      "El precio cambió: antes $ 1.499, ahora $ 1.299.",
    );
    expect(db.addToCart).toHaveBeenCalledWith(
      expect.objectContaining({ productId: PRODUCT, lookId: LOOK, slot: "top", variantId: null }),
    );
    expect(trackEvent).toHaveBeenCalledTimes(1);
    expect(trackEvent).toHaveBeenCalledWith("product_added_to_cart", {
      userId: USER,
      path: "/app/cart",
      properties: {
        product_id: PRODUCT,
        store_domain: "tienda.com.uy",
        look_id: LOOK,
        slot: "top",
        price: 1299,
        currency: "UYU",
        revalidation: "verified",
        source: "add",
      },
    });
    expect(revalidatePath).toHaveBeenCalledWith("/app/cart");
    expect(revalidatePath).toHaveBeenCalledWith(`/app/looks/${LOOK}`);
  });

  it("revalida con el worker (service role), no desde la web", async () => {
    db.addToCart.mockResolvedValue({ ...change, cartId: OTHER, alreadyInCart: false });
    db.waitForProductRefresh.mockResolvedValue("verified");
    await addToCartAction(idle, form(fields));
    const { revalidate } = db.addToCart.mock.calls[0]![0] as {
      revalidate: (id: string) => Promise<string>;
    };
    expect(await revalidate(PRODUCT)).toBe("verified");
    expect(db.waitForProductRefresh).toHaveBeenCalledWith(service, PRODUCT);
  });

  it("si ya estaba no se cuenta otra vez", async () => {
    db.addToCart.mockResolvedValue({ ...change, cartId: OTHER, alreadyInCart: true });
    expect(await addToCartAction(idle, form(fields))).toMatchObject({
      status: "done",
      message: "Ya estaba en tu carrito.",
    });
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("un local físico sin precio: mensaje humano", async () => {
    db.addToCart.mockRejectedValue(new AppError("VALIDATION_FAILED", "NO_PRICE"));
    expect(await addToCartAction(idle, form(fields))).toEqual({
      status: "error",
      error:
        "Este producto se consigue en el local y no tiene precio publicado: no se puede sumar al carrito.",
    });
  });

  it("pedido mal armado o error técnico: nunca se muestra el detalle", async () => {
    expect(await addToCartAction(idle, form({ productId: PRODUCT, lookId: LOOK }))).toEqual({
      status: "error",
      error: "No pudimos procesar el pedido.",
    });
    expect(db.addToCart).not.toHaveBeenCalled();

    db.addToCart.mockRejectedValue(new Error("duplicate key value violates unique constraint"));
    expect(await addToCartAction(idle, form(fields))).toEqual({
      status: "error",
      error: "No pudimos agregarlo al carrito. Probá de nuevo.",
    });
  });
});

describe("removeFromCartAction / swapCartItemAction / setCartItemPurchasedAction", () => {
  it("sacar emite product_removed_from_cart", async () => {
    db.removeFromCart.mockResolvedValue({
      itemId: ITEM,
      productId: PRODUCT,
      lookId: LOOK,
      slot: "top",
    });
    expect(await removeFromCartAction(idle, form({ itemId: ITEM }))).toMatchObject({
      status: "done",
    });
    expect(trackEvent).toHaveBeenCalledWith("product_removed_from_cart", {
      userId: USER,
      path: "/app/cart",
      properties: { product_id: PRODUCT, look_id: LOOK, slot: "top", source: "remove" },
    });
  });

  it("cambiar por otra alternativa: sale una y entra otra (si no se juntaron)", async () => {
    db.swapCartItem.mockResolvedValue({ ...change, previousProductId: OTHER, merged: false });
    await swapCartItemAction(idle, form({ itemId: ITEM, productId: PRODUCT }));
    expect(trackEvent.mock.calls.map(([name, event]) => [name, event.properties.source])).toEqual([
      ["product_removed_from_cart", "swap"],
      ["product_added_to_cart", "swap"],
    ]);

    trackEvent.mockClear();
    db.swapCartItem.mockResolvedValue({ ...change, previousProductId: OTHER, merged: true });
    await swapCartItemAction(idle, form({ itemId: ITEM, productId: PRODUCT }));
    expect(trackEvent.mock.calls.map(([name]) => name)).toEqual(["product_removed_from_cart"]);
  });

  it("comprado: Premium, sin evento; un vencido recibe paywall", async () => {
    db.setCartItemPurchased.mockResolvedValue({
      itemId: ITEM,
      productId: PRODUCT,
      purchasedAt: "x",
    });
    expect(
      await setCartItemPurchasedAction(idle, form({ itemId: ITEM, purchased: "true" })),
    ).toMatchObject({ status: "done", message: "Marcado como comprado." });
    expect(db.setCartItemPurchased).toHaveBeenCalledWith(
      expect.objectContaining({ itemId: ITEM, purchased: true }),
    );
    expect(trackEvent).not.toHaveBeenCalled();

    db.requirePremium.mockRejectedValue(premiumRequired());
    expect(await removeFromCartAction(idle, form({ itemId: ITEM }))).toEqual({ status: "paywall" });
    expect(db.removeFromCart).not.toHaveBeenCalled();
  });
});

describe("saveFavoriteAction / removeFavoriteAction", () => {
  it("un look se guarda con cualquier plan y emite look_saved", async () => {
    db.requirePremium.mockRejectedValue(premiumRequired());
    db.saveFavorite.mockResolvedValue({ favoriteId: ITEM, alreadySaved: false, storeDomain: null });
    expect(await saveFavoriteAction(idle, form({ lookId: LOOK }))).toEqual({
      status: "saved",
      alreadySaved: false,
    });
    expect(db.requireAuth).toHaveBeenCalled();
    expect(trackEvent).toHaveBeenCalledWith("look_saved", {
      userId: USER,
      path: "/app/favorites",
      properties: { look_id: LOOK },
    });
  });

  it("un producto exige Premium: free recibe paywall, sin guardar ni quitar", async () => {
    db.requirePremium.mockRejectedValue(premiumRequired());
    expect(await saveFavoriteAction(idle, form({ productId: PRODUCT }))).toEqual({
      status: "paywall",
    });
    expect(await removeFavoriteAction(idle, form({ productId: PRODUCT }))).toEqual({
      status: "paywall",
    });
    expect(db.saveFavorite).not.toHaveBeenCalled();
    expect(db.removeFavorite).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("Premium guarda un producto: product_saved con la tienda, una sola vez", async () => {
    db.saveFavorite.mockResolvedValue({
      favoriteId: ITEM,
      alreadySaved: false,
      storeDomain: "tienda.com.uy",
    });
    await saveFavoriteAction(idle, form({ productId: PRODUCT }));
    expect(trackEvent).toHaveBeenCalledWith("product_saved", {
      userId: USER,
      path: "/app/favorites",
      properties: { product_id: PRODUCT, store_domain: "tienda.com.uy" },
    });

    trackEvent.mockClear();
    db.saveFavorite.mockResolvedValue({
      favoriteId: ITEM,
      alreadySaved: true,
      storeDomain: "tienda.com.uy",
    });
    expect(await saveFavoriteAction(idle, form({ productId: PRODUCT }))).toEqual({
      status: "saved",
      alreadySaved: true,
    });
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("look y producto a la vez, o ninguno: pedido inválido", async () => {
    expect(await saveFavoriteAction(idle, form({ lookId: LOOK, productId: PRODUCT }))).toEqual({
      status: "error",
      error: "No pudimos procesar el pedido.",
    });
    expect(await saveFavoriteAction(idle, form({}))).toMatchObject({ status: "error" });
    expect(db.saveFavorite).not.toHaveBeenCalled();
  });
});
