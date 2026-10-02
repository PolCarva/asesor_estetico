import { buildCartView, type Product, type RankedProduct, splitStyleProfile } from "@asesor/shared";
import {
  FIXTURE_IN_STORE_PRODUCT,
  FIXTURE_LOOK_SPECS,
  FIXTURE_PRODUCTS,
  FIXTURE_STYLE_PROFILE,
} from "@asesor/shared/fixtures";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import {
  addLookToCart,
  addToCart,
  ALREADY_IN_CART,
  getCartLines,
  NO_LOOK,
  PRODUCT_GONE,
  removeFromCart,
  type RevalidateProduct,
  selectCartItemVariant,
  setCartItemPurchased,
  swapCartItem,
  VARIANT_GONE,
} from "../../src/cart";
import {
  markProductUnverified,
  markProductVerified,
  getProductById,
  saveLookProducts,
} from "../../src/shopping";
import { NO_PRICE, waitForProductRefresh } from "../../src/shopping-jobs";
import { toJson } from "../../src/types";
import { adminClient, createTestUser, deleteTestUser, describeIntegration } from "./setup";

/**
 * Carrito (paso 10a): Premium y RLS, IDOR, precio fijado por la base, talles, cambio por otra
 * alternativa, comprado, productos sin precio y revalidación de datos viejos. Las
 * revalidaciones se simulan (como las haría el worker) y ningún test toma jobs de la cola.
 */
describeIntegration("carrito: datos y acciones", () => {
  const admin = adminClient();
  const tag = crypto.randomUUID().slice(0, 8);
  type User = Awaited<ReturnType<typeof createTestUser>>;
  let premium: User;
  let free: User;
  let other: User;
  let looks: string[] = [];
  let otherLooks: string[] = [];
  const ids = new Map<string, string>();

  const [OXFORD, BLANCA, CHINO] = FIXTURE_PRODUCTS;
  const HOUR = 3_600_000;

  /** Copia del fixture con URL e ids propios, verificada ahora (o hace `ageHours`). */
  function product(base: Product, key: string, overrides: Partial<Product> = {}): Product {
    return {
      ...base,
      id: `${base.id}-${tag}-${key}`,
      url: `${base.url}-${tag}-${key}`,
      fetched_at: new Date().toISOString(),
      variants: base.variants.map((v) => ({ ...v, id: `${v.id}-${tag}-${key}` })),
      ...overrides,
    };
  }

  const ranked = (list: Product[]): RankedProduct[] =>
    list.map((p, i) => ({
      product: p,
      score: 0.9 - i / 10,
      breakdown: {
        category_match: 1,
        visual_similarity: 0.8,
        color_match: 1,
        fit_match: 1,
        material_match: 0.5,
        size_available: 1,
        stock: 1,
        price: 1,
      },
      size_status: "AVAILABLE",
    }));

  async function createLooks(userId: string) {
    const { core, advice } = splitStyleProfile(FIXTURE_STYLE_PROFILE);
    const { data, error } = await admin.rpc("create_style_profile_with_looks", {
      p_user_id: userId,
      p_profile: toJson(core),
      p_advice: toJson(advice),
      p_looks: toJson(FIXTURE_LOOK_SPECS),
    });
    expect(error).toBeNull();
    return data!.sort((a, b) => a.look_position - b.look_position).map((r) => r.look_id);
  }

  async function subscribe(userId: string, endsInMs = 86_400_000) {
    const { error } = await admin.from("subscriptions").insert({
      user_id: userId,
      provider: "MOCK",
      provider_subscription_id: `test-${userId}`,
      status: "ACTIVE",
      current_period_start: new Date(Date.now() - 86_400_000).toISOString(),
      current_period_end: new Date(Date.now() + endsInMs).toISOString(),
    });
    expect(error).toBeNull();
  }

  /** Resultados de una prenda de un look, guardados como los guarda el worker. */
  async function results(lookId: string, slot: string, list: Product[], userSize = "M") {
    await saveLookProducts(admin, { lookId, slot, items: ranked(list), userSize });
    const { data } = await admin
      .from("products")
      .select("id, url")
      .in(
        "url",
        list.map((p) => p.url),
      );
    for (const row of data ?? []) ids.set(row.url, row.id);
  }

  const idOf = (p: Product) => ids.get(p.url)!;
  async function variantIds(productId: string) {
    const { data } = await admin
      .from("product_variants")
      .select("id, size")
      .eq("product_id", productId);
    return new Map((data ?? []).map((v) => [v.size, v.id]));
  }
  const age = (productId: string, hours: number) =>
    admin
      .from("products")
      .update({ last_fetched_at: new Date(Date.now() - hours * HOUR).toISOString() })
      .eq("id", productId);
  const fetchedAt = async (productId: string) =>
    (await admin.from("products").select("last_fetched_at").eq("id", productId).single()).data!
      .last_fetched_at;
  const itemsOf = async (userId: string) => {
    const { data: cart } = await admin
      .from("carts")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!cart) return [];
    const { data } = await admin.from("cart_items").select("*").eq("cart_id", cart.id);
    return data ?? [];
  };

  const notCalled: RevalidateProduct = vi.fn(async () => "verified" as const);

  // Productos: dos camisas para "top" (la cruda con L más cara), un chino para "bottom" y
  // un local físico sin precio para un accesorio.
  const oxford = product(OXFORD!, "oxford", {
    variants: OXFORD!.variants.map((v) => ({
      ...v,
      id: `${v.id}-${tag}-oxford`,
      price: v.size === "L" ? { amount: 2090, currency: "UYU" } : null,
    })),
  });
  const blanca = product(BLANCA!, "blanca");
  const chino = product(CHINO!, "chino");
  const local = product(FIXTURE_IN_STORE_PRODUCT, "local");

  beforeAll(async () => {
    premium = await createTestUser("cart-premium");
    free = await createTestUser("cart-free");
    other = await createTestUser("cart-other");
    looks = await createLooks(premium.id);
    otherLooks = await createLooks(other.id);
    await createLooks(free.id);
    await subscribe(premium.id);
    await subscribe(other.id);

    await results(looks[0]!, "top", [oxford, blanca]);
    await results(looks[0]!, "bottom", [chino], "42");
    await results(looks[0]!, "accessory:0", [local]);
    await results(looks[1]!, "top", [oxford]);
    await results(otherLooks[0]!, "top", [oxford]);
  });

  afterAll(async () => {
    // Las revalidaciones encoladas: si quedaran, otro test que reclama REFRESH_PRODUCT las tomaría.
    for (const id of ids.values()) {
      await admin.from("jobs").delete().like("idempotency_key", `refresh:${id}:%`);
    }
    for (const user of [premium, free, other]) if (user) await deleteTestUser(user.id);
    await admin.from("products").delete().like("url", `%-${tag}-%`);
  });

  describe("Premium y RLS", () => {
    it("un usuario free no puede crear el carrito ni agregar ítems", async () => {
      const { data: freeLook } = await admin
        .from("looks")
        .select("id")
        .eq("user_id", free.id)
        .eq("position", 1)
        .single();
      await expect(
        addToCart({
          userClient: free.client,
          productId: idOf(oxford),
          lookId: freeLook!.id,
          slot: "top",
          revalidate: notCalled,
        }),
      ).rejects.toMatchObject({ code: "PREMIUM_REQUIRED" });

      const cart = await free.client.from("carts").insert({ user_id: free.id });
      expect(cart.error?.code).toBe("42501");
      // Aunque tuviera un carrito (creado por fuera), no puede agregarle ítems.
      const { data: forced } = await admin
        .from("carts")
        .insert({ user_id: free.id })
        .select("id")
        .single();
      const item = await free.client
        .from("cart_items")
        .insert({ cart_id: forced!.id, product_id: idOf(oxford) });
      expect(item.error?.code).toBe("42501");
      expect(await itemsOf(free.id)).toHaveLength(0);
    });

    it("Premium agrega con el talle de su búsqueda, sin duplicar, y el mismo producto en dos looks", async () => {
      const first = await addToCart({
        userClient: premium.client,
        productId: idOf(oxford),
        lookId: looks[0]!,
        slot: "top",
        revalidate: notCalled,
      });
      const variants = await variantIds(idOf(oxford));
      expect(first).toMatchObject({
        alreadyInCart: false,
        lookId: looks[0],
        slot: "top",
        variantId: variants.get("M"),
        price: { amount: 1890, currency: "UYU" },
        priceChange: null,
        revalidation: "fresh",
        availability: "IN_STOCK",
      });
      expect(notCalled).not.toHaveBeenCalled();

      const again = await addToCart({
        userClient: premium.client,
        productId: idOf(oxford),
        lookId: looks[0]!,
        slot: "top",
        revalidate: notCalled,
      });
      expect(again).toMatchObject({ alreadyInCart: true, itemId: first.itemId });

      const otherLook = await addToCart({
        userClient: premium.client,
        productId: idOf(oxford),
        lookId: looks[1]!,
        slot: "top",
        revalidate: notCalled,
      });
      expect(otherLook.itemId).not.toBe(first.itemId);
      expect(otherLook.cartId).toBe(first.cartId);
      expect(await itemsOf(premium.id)).toHaveLength(2);
    });

    it("dos pedidos a la vez crean un solo carrito y un solo ítem", async () => {
      const add = () =>
        addToCart({
          userClient: other.client,
          productId: idOf(oxford),
          lookId: otherLooks[0]!,
          slot: "top",
          revalidate: notCalled,
        });
      const [a, b] = await Promise.all([add(), add()]);
      expect(a.cartId).toBe(b.cartId);
      expect(a.itemId).toBe(b.itemId);
      expect([a.alreadyInCart, b.alreadyInCart].sort()).toEqual([false, true]);
      const { data: carts } = await admin.from("carts").select("id").eq("user_id", other.id);
      expect(carts).toHaveLength(1);
      expect(await itemsOf(other.id)).toHaveLength(1);
    });
  });

  describe("IDOR", () => {
    it("no se puede usar el carrito ni el look de otro usuario", async () => {
      const { data: otherCart } = await admin
        .from("carts")
        .select("id")
        .eq("user_id", other.id)
        .single();
      const intoOtherCart = await premium.client
        .from("cart_items")
        .insert({ cart_id: otherCart!.id, product_id: idOf(blanca) });
      expect(intoOtherCart.error?.code).toBe("42501");

      const { data: ownCart } = await admin
        .from("carts")
        .select("id")
        .eq("user_id", premium.id)
        .single();
      const withOtherLook = await premium.client.from("cart_items").insert({
        cart_id: ownCart!.id,
        product_id: idOf(blanca),
        look_id: otherLooks[0],
        garment_slot: "top",
      });
      expect(withOtherLook.error?.code).toBe("42501");

      await expect(
        addToCart({
          userClient: premium.client,
          productId: idOf(oxford),
          lookId: otherLooks[0]!,
          slot: "top",
          revalidate: notCalled,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      // Un producto que no es resultado de esa prenda tampoco.
      await expect(
        addToCart({
          userClient: premium.client,
          productId: idOf(chino),
          lookId: looks[0]!,
          slot: "top",
          revalidate: notCalled,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("otro usuario no ve, no borra ni modifica ítems ajenos", async () => {
      const [item] = await itemsOf(premium.id);
      const seen = await other.client.from("cart_items").select("id").eq("id", item!.id);
      expect(seen.data).toEqual([]);
      const deleted = await other.client.from("cart_items").delete().eq("id", item!.id).select();
      expect(deleted.data).toEqual([]);
      await expect(
        removeFromCart({ userClient: other.client, itemId: item!.id }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        setCartItemPurchased({ userClient: other.client, itemId: item!.id, purchased: true }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      expect((await itemsOf(premium.id)).find((i) => i.id === item!.id)?.purchased_at).toBeNull();
    });
  });

  describe("precio", () => {
    it("se ignora el precio que manda el cliente: lo fija la base desde el catálogo", async () => {
      const { data: cart } = await admin
        .from("carts")
        .select("id")
        .eq("user_id", premium.id)
        .single();
      const forged = await premium.client.from("cart_items").insert({
        cart_id: cart!.id,
        product_id: idOf(blanca),
        price_amount_snapshot: 1,
        currency_snapshot: "USD",
      });
      expect(forged.error?.code).toBe("42501");

      const [item] = await itemsOf(premium.id);
      const update = await premium.client
        .from("cart_items")
        .update({ price_amount_snapshot: 1 })
        .eq("id", item!.id);
      expect(update.error?.code).toBe("42501");
      const after = (await itemsOf(premium.id)).find((i) => i.id === item!.id)!;
      expect(Number(after.price_amount_snapshot)).toBe(1890);
    });

    it("cambiar el talle recalcula el precio, y valida que sea de ese producto", async () => {
      const item = (await itemsOf(premium.id)).find((i) => i.look_id === looks[0])!;
      const variants = await variantIds(idOf(oxford));

      const large = await selectCartItemVariant({
        userClient: premium.client,
        itemId: item.id,
        variantId: variants.get("L")!,
      });
      expect(large).toMatchObject({
        price: { amount: 2090, currency: "UYU" },
        priceChange: { from: { amount: 1890 }, to: { amount: 2090 } },
        availability: "OUT_OF_STOCK",
      });
      const none = await selectCartItemVariant({
        userClient: premium.client,
        itemId: item.id,
        variantId: null,
      });
      expect(none.price.amount).toBe(1890);

      const [chinoVariant] = (await variantIds(idOf(chino))).values();
      await expect(
        selectCartItemVariant({
          userClient: premium.client,
          itemId: item.id,
          variantId: chinoVariant!,
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED", message: VARIANT_GONE });
      // También en la base (trigger), aunque se salteara la lógica.
      const direct = await premium.client
        .from("cart_items")
        .update({ variant_id: chinoVariant })
        .eq("id", item.id);
      expect(direct.error?.message).toMatch(/does not belong to product/);

      // Otro ítem de la misma prenda con el talle M: elegir M en el primero no duplica.
      await selectCartItemVariant({
        userClient: premium.client,
        itemId: item.id,
        variantId: variants.get("L")!,
      });
      await addToCart({
        userClient: premium.client,
        productId: idOf(oxford),
        variantId: variants.get("M")!,
        lookId: looks[0]!,
        slot: "top",
        revalidate: notCalled,
      });
      await expect(
        selectCartItemVariant({
          userClient: premium.client,
          itemId: item.id,
          variantId: variants.get("M")!,
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED", message: ALREADY_IN_CART });
      await removeFromCart({ userClient: premium.client, itemId: item.id });
    });
  });

  describe("productos sin precio", () => {
    it("un local físico sin precio no entra: error controlado, sin ítem", async () => {
      const before = await itemsOf(premium.id);
      await expect(
        addToCart({
          userClient: premium.client,
          productId: idOf(local),
          lookId: looks[0]!,
          slot: "accessory:0",
          revalidate: notCalled,
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED", message: NO_PRICE });
      expect(await itemsOf(premium.id)).toHaveLength(before.length);
    });

    it("si un producto del carrito se queda sin precio, el carrito sigue y lo deja fuera del total", async () => {
      const added = await addToCart({
        userClient: premium.client,
        productId: idOf(chino),
        lookId: looks[0]!,
        slot: "bottom",
        revalidate: notCalled,
      });
      // Toma el talle de la búsqueda (42).
      expect(added.variantId).toBe((await variantIds(idOf(chino))).get("42"));
      const { error } = await admin
        .from("products")
        .update({ price_amount: null, currency: null, availability: "IN_STORE_ONLY" })
        .eq("id", idOf(chino));
      expect(error).toBeNull();

      const lines = await getCartLines(premium.client);
      const line = lines.find((l) => l.id === added.itemId)!;
      expect(line.current).toBeNull();
      expect(line.snapshot).toEqual({ amount: 2290, currency: "UYU" });
      const view = buildCartView(lines);
      expect(view.totals.withoutPrice).toBe(1);
      expect(view.totals.pending).toEqual([
        {
          amount: lines
            .filter((l) => l.current)
            .reduce((sum, l) => sum + l.current!.amount * l.quantity, 0),
          currency: "UYU",
        },
      ]);
      // Cambiar el talle (o que la tienda deje de publicarlo) no rompe: conserva el último
      // precio conocido.
      const variant = await selectCartItemVariant({
        userClient: premium.client,
        itemId: added.itemId,
        variantId: null,
      });
      expect(variant.price).toEqual({ amount: 2290, currency: "UYU" });

      await admin
        .from("products")
        .update({ price_amount: 2290, currency: "UYU", availability: "IN_STOCK" })
        .eq("id", idOf(chino));
    });
  });

  describe("cambiar por otra alternativa", () => {
    it("reemplaza por otra opción de la misma prenda, con el talle de la búsqueda", async () => {
      const item = (await itemsOf(premium.id)).find(
        (i) => i.look_id === looks[0] && i.garment_slot === "top",
      )!;
      const swapped = await swapCartItem({
        userClient: premium.client,
        itemId: item.id,
        productId: idOf(blanca),
        revalidate: notCalled,
      });
      expect(swapped).toMatchObject({
        itemId: item.id,
        previousProductId: idOf(oxford),
        productId: idOf(blanca),
        variantId: (await variantIds(idOf(blanca))).get("M"),
        price: { amount: 990, currency: "UYU" },
        merged: false,
      });

      await expect(
        swapCartItem({
          userClient: premium.client,
          itemId: item.id,
          productId: idOf(chino),
          revalidate: notCalled,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
    });

    it("si la alternativa ya estaba en esa prenda, quedan juntas en un ítem", async () => {
      const again = await addToCart({
        userClient: premium.client,
        productId: idOf(oxford),
        lookId: looks[0]!,
        slot: "top",
        revalidate: notCalled,
      });
      const merged = await swapCartItem({
        userClient: premium.client,
        itemId: again.itemId,
        productId: idOf(blanca),
        revalidate: notCalled,
      });
      expect(merged.merged).toBe(true);
      const top = (await itemsOf(premium.id)).filter(
        (i) => i.look_id === looks[0] && i.garment_slot === "top",
      );
      expect(top.map((i) => i.product_id)).toEqual([idOf(blanca)]);
    });

    it("un producto suelto (sin look) no tiene alternativas", async () => {
      const loose = await addToCart({
        userClient: premium.client,
        productId: idOf(chino),
        revalidate: notCalled,
      });
      expect(loose).toMatchObject({ lookId: null, slot: null });
      await expect(
        swapCartItem({
          userClient: premium.client,
          itemId: loose.itemId,
          productId: idOf(oxford),
          revalidate: notCalled,
        }),
      ).rejects.toMatchObject({ code: "VALIDATION_FAILED", message: NO_LOOK });
      await removeFromCart({ userClient: premium.client, itemId: loose.itemId });
    });
  });

  describe("comprado y Premium vencido", () => {
    it("el dueño marca y desmarca; lo comprado tiene su propio total", async () => {
      const [item] = await itemsOf(premium.id);
      const marked = await setCartItemPurchased({
        userClient: premium.client,
        itemId: item!.id,
        purchased: true,
      });
      expect(marked.purchasedAt).not.toBeNull();
      const view = buildCartView(await getCartLines(premium.client));
      expect(view.totals.purchasedCount).toBe(1);

      const unmarked = await setCartItemPurchased({
        userClient: premium.client,
        itemId: item!.id,
        purchased: false,
      });
      expect(unmarked.purchasedAt).toBeNull();
    });

    it("con Premium vencido el carrito queda en solo lectura", async () => {
      const [item] = await itemsOf(other.id);
      await admin
        .from("subscriptions")
        .update({ current_period_end: new Date(Date.now() - 1000).toISOString() })
        .eq("user_id", other.id);

      expect(await getCartLines(other.client)).toHaveLength(1);
      await expect(
        setCartItemPurchased({ userClient: other.client, itemId: item!.id, purchased: true }),
      ).rejects.toMatchObject({ code: "PREMIUM_REQUIRED" });
      await expect(
        removeFromCart({ userClient: other.client, itemId: item!.id }),
      ).rejects.toMatchObject({ code: "PREMIUM_REQUIRED" });
      const direct = await other.client
        .from("cart_items")
        .update({ purchased_at: new Date().toISOString() })
        .eq("id", item!.id);
      expect(direct.error?.code).toBe("42501");

      await admin
        .from("subscriptions")
        .update({ current_period_end: new Date(Date.now() + 86_400_000).toISOString() })
        .eq("user_id", other.id);
    });
  });

  describe("revalidación de datos viejos (más de 8 h)", () => {
    const stale = (key: string) => product(OXFORD!, `stale-${key}`);
    const staleProducts = {
      verified: stale("verified"),
      failed: stale("failed"),
      gone: stale("gone"),
      pending: stale("pending"),
    };

    beforeAll(async () => {
      await results(looks[2]!, "top", Object.values(staleProducts));
      for (const p of Object.values(staleProducts)) await age(idOf(p), 10);
    });

    const add = (p: Product, revalidate: RevalidateProduct) =>
      addToCart({
        userClient: premium.client,
        productId: idOf(p),
        lookId: looks[2]!,
        slot: "top",
        revalidate,
      });

    it("verificado: datos y fecha nuevos, y avisa que cambió el precio", async () => {
      const id = idOf(staleProducts.verified);
      const revalidate = vi.fn<RevalidateProduct>(async (productId) => {
        // Lo que hace el worker con REFRESH_PRODUCT cuando la tienda responde.
        const stored = await getProductById(admin, productId);
        await markProductVerified(admin, productId, {
          ...stored!.product,
          price: { amount: 1690, currency: "UYU" },
          fetched_at: new Date().toISOString(),
        });
        return "verified";
      });
      const result = await add(staleProducts.verified, revalidate);
      expect(revalidate).toHaveBeenCalledWith(id);
      expect(result).toMatchObject({
        revalidation: "verified",
        price: { amount: 1690, currency: "UYU" },
        priceChange: { from: { amount: 1890 }, to: { amount: 1690 } },
        availability: "IN_STOCK",
      });
      expect(Date.now() - Date.parse(await fetchedAt(id))).toBeLessThan(60_000);
    });

    it("la tienda no respondió: entra con el último dato, stock UNKNOWN y la fecha no avanza", async () => {
      const id = idOf(staleProducts.failed);
      const before = await fetchedAt(id);
      const result = await add(staleProducts.failed, async (productId) => {
        await markProductUnverified(admin, productId);
        return "failed";
      });
      expect(result).toMatchObject({
        revalidation: "unverified",
        availability: "UNKNOWN",
        price: { amount: 1890 },
        priceChange: null,
      });
      expect(await fetchedAt(id)).toBe(before);
    });

    it("un 'verified' que no dejó el dato fresco no cuenta como verificado", async () => {
      // El job de esta hora ya había terminado, pero el producto volvió a tener más de 8 h.
      await age(idOf(staleProducts.verified), 10);
      const again = await add(staleProducts.verified, async () => "verified");
      expect(again).toMatchObject({
        alreadyInCart: true,
        revalidation: "unverified",
        availability: "UNKNOWN",
      });
    });

    it("no terminó a tiempo: entra con el último dato y el stock se informa como UNKNOWN", async () => {
      const result = await add(staleProducts.pending, async () => "pending");
      expect(result).toMatchObject({ revalidation: "pending", availability: "UNKNOWN" });
    });

    it("la tienda lo sacó: no entra", async () => {
      const before = await itemsOf(premium.id);
      await expect(add(staleProducts.gone, async () => "gone")).rejects.toMatchObject({
        code: "VALIDATION_FAILED",
        message: PRODUCT_GONE,
      });
      expect(await itemsOf(premium.id)).toHaveLength(before.length);
    });

    it("waitForProductRefresh: encola una revalidación por hora y espera al worker", async () => {
      const id = idOf(staleProducts.pending);
      // Sin worker: no termina a tiempo y el job queda en la cola.
      expect(await waitForProductRefresh(admin, id, { timeoutMs: 300, pollMs: 50 })).toBe(
        "pending",
      );
      const { data: queued } = await admin
        .from("jobs")
        .select("id, status, priority, idempotency_key")
        .eq("type", "REFRESH_PRODUCT")
        .eq("payload->>product_id", id);
      expect(queued).toHaveLength(1);
      expect(queued![0]).toMatchObject({ status: "QUEUED", priority: 9 });
      expect(queued![0]!.idempotency_key).toMatch(
        new RegExp(`^refresh:${id}:\\d{4}-\\d{2}-\\d{2}T\\d{2}$`),
      );

      // El "worker" lo termina mientras se espera: mismo job (misma hora), resultado real.
      const waiting = waitForProductRefresh(admin, id, { timeoutMs: 5000, pollMs: 50 });
      await new Promise((r) => setTimeout(r, 200));
      await admin
        .from("jobs")
        .update({
          status: "COMPLETED",
          result: { product_id: id, status: "verified", availability: "IN_STOCK" },
          finished_at: new Date().toISOString(),
        })
        .eq("id", queued![0]!.id);
      expect(await waiting).toBe("verified");

      // Un job que falló cuenta como no verificado, sin volver a esperar.
      const failedId = idOf(staleProducts.failed);
      await waitForProductRefresh(admin, failedId, { timeoutMs: 0 });
      const { data: failedJob } = await admin
        .from("jobs")
        .update({ status: "FAILED", finished_at: new Date().toISOString() })
        .eq("payload->>product_id", failedId)
        .eq("type", "REFRESH_PRODUCT")
        .select("id")
        .single();
      expect(failedJob).not.toBeNull();
      expect(await waitForProductRefresh(admin, failedId, { timeoutMs: 0 })).toBe("failed");
      const { count } = await admin
        .from("jobs")
        .select("id", { count: "exact", head: true })
        .eq("payload->>product_id", failedId);
      expect(count).toBe(1);
    });
  });

  describe("talle del perfil y look completo (paso 10b)", () => {
    it("sin talle elegido, manda el talle del perfil sobre el de la búsqueda", async () => {
      await results(looks[1]!, "layering:0", [oxford]);
      await admin.from("profiles").update({ top_size: "L" }).eq("id", premium.id);
      const added = await addToCart({
        userClient: premium.client,
        productId: idOf(oxford),
        lookId: looks[1]!,
        slot: "layering:0",
        revalidate: notCalled,
      });
      expect(added.variantId).toBe((await variantIds(idOf(oxford))).get("L"));
      expect(added.price.amount).toBe(2090);
      // El talle cuesta otra cosa que el precio que se mostraba: la UI lo avisa.
      expect(added.listedPrice).toEqual({ amount: 1890, currency: "UYU" });
      expect(added.variant).toMatchObject({ size: "L" });
      await admin.from("profiles").update({ top_size: null }).eq("id", premium.id);

      const line = (await getCartLines(premium.client)).find((l) => l.id === added.itemId)!;
      expect(line.variant?.size).toBe("L");
      expect(line.variants.map((v) => [v.size, v.availability])).toEqual(
        expect.arrayContaining([
          ["M", "IN_STOCK"],
          ["L", "OUT_OF_STOCK"],
        ]),
      );
    });

    it("a igualdad de talle, elige la variante del color de la prenda del look (paso 12b)", async () => {
      // La bermuda del look 3 es "crudo" (#EFE8DA): de las dos variantes 42, la cruda.
      const variant = (key: string, color: string) => ({
        id: `ber-${key}-${tag}`,
        sku: null,
        size: "42",
        size_label: "42",
        color,
        availability: "IN_STOCK" as const,
        price: null,
      });
      const bermuda = product(CHINO!, "bermuda", {
        category: "SHORTS",
        variants: [variant("oscura", "azul oscuro"), variant("cruda", "crudo")],
      });
      await results(looks[2]!, "bottom", [bermuda], "42");
      const added = await addToCart({
        userClient: premium.client,
        productId: idOf(bermuda),
        lookId: looks[2]!,
        slot: "bottom",
        revalidate: notCalled,
      });
      expect(added.variant).toMatchObject({ size: "42", color: "crudo" });
    });

    it("completa las prendas vacías con el recomendado; la que no tiene precio no frena a las demás", async () => {
      // `other` ya tiene la camisa de "top" en el carrito (test de concurrencia); el pantalón y
      // el accesorio (local físico sin precio) están vacíos.
      await results(otherLooks[0]!, "bottom", [chino], "42");
      await results(otherLooks[0]!, "accessory:0", [local]);
      const first = await addLookToCart({
        userClient: other.client,
        lookId: otherLooks[0]!,
        revalidate: notCalled,
      });
      expect(first.added.map((a) => [a.slot, a.productId])).toEqual([["bottom", idOf(chino)]]);
      expect(first.present).toEqual([{ slot: "top", productId: idOf(oxford) }]);
      expect(first.skipped).toEqual([
        { slot: "accessory:0", productId: idOf(local), reason: NO_PRICE },
      ]);

      // Lo que ya tiene algo no se vuelve a agregar, aunque sea otro talle u otra opción.
      const bottom = first.added[0]!;
      await selectCartItemVariant({
        userClient: other.client,
        itemId: bottom.itemId,
        variantId: null,
      });
      const again = await addLookToCart({
        userClient: other.client,
        lookId: otherLooks[0]!,
        revalidate: notCalled,
      });
      expect(again.added).toEqual([]);
      expect(again.present.map((p) => p.slot).sort()).toEqual(["bottom", "top"]);
      expect((await itemsOf(other.id)).filter((i) => i.garment_slot === "bottom")).toHaveLength(1);

      await expect(
        addLookToCart({
          userClient: premium.client,
          lookId: otherLooks[0]!,
          revalidate: notCalled,
        }),
      ).rejects.toMatchObject({ code: "NOT_FOUND" });
      await expect(
        addLookToCart({ userClient: free.client, lookId: looks[0]!, revalidate: notCalled }),
      ).rejects.toMatchObject({ code: "PREMIUM_REQUIRED" });
    });
  });

  describe("lectura agrupada", () => {
    it("getCartLines trae look, prenda, talle y precio actual; buildCartView agrupa por look", async () => {
      const lines = await getCartLines(premium.client);
      expect(lines.length).toBeGreaterThan(0);
      for (const line of lines) {
        expect(line.look?.id).toBeDefined();
        expect(line.look?.name).toBeTruthy();
        expect(line.slot).not.toBeNull();
      }
      const view = buildCartView(lines);
      expect(view.groups.map((g) => g.look?.position)).toEqual(
        [...new Set(lines.map((l) => l.look!.position))].sort(),
      );
      // Ningún usuario ve el carrito de otro.
      const others = await getCartLines(other.client);
      expect(others.every((l) => !lines.some((mine) => mine.id === l.id))).toBe(true);
    });
  });
});

describeIntegration("carrito: looks borrados", () => {
  const admin = adminClient();
  const tag = crypto.randomUUID().slice(0, 8);
  let user: Awaited<ReturnType<typeof createTestUser>>;

  afterAll(async () => {
    if (user) await deleteTestUser(user.id);
    await admin.from("products").delete().like("url", `%-${tag}%`);
  });

  it("borrar looks deja sus ítems en el carrito, sin look, aunque repitan producto", async () => {
    user = await createTestUser("cart-orphans");
    const { core, advice } = splitStyleProfile(FIXTURE_STYLE_PROFILE);
    const { data: created } = await admin.rpc("create_style_profile_with_looks", {
      p_user_id: user.id,
      p_profile: toJson(core),
      p_advice: toJson(advice),
      p_looks: toJson(FIXTURE_LOOK_SPECS),
    });
    const lookIds = created!.map((r) => r.look_id);
    await admin.from("subscriptions").insert({
      user_id: user.id,
      provider: "MOCK",
      provider_subscription_id: `test-${user.id}`,
      status: "ACTIVE",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 86_400_000).toISOString(),
    });
    const shirt: Product = {
      ...FIXTURE_PRODUCTS[1]!,
      id: `orphan-${tag}`,
      url: `${FIXTURE_PRODUCTS[1]!.url}-${tag}`,
      fetched_at: new Date().toISOString(),
      variants: [],
    };
    for (const lookId of lookIds) {
      await saveLookProducts(admin, {
        lookId,
        slot: "top",
        items: [
          {
            product: shirt,
            score: 0.9,
            breakdown: {
              category_match: 1,
              visual_similarity: 1,
              color_match: 1,
              fit_match: 1,
              material_match: 1,
              size_available: 1,
              stock: 1,
              price: 1,
            },
            size_status: "AVAILABLE",
          },
        ],
      });
    }
    const { data: row } = await admin.from("products").select("id").eq("url", shirt.url).single();
    for (const lookId of lookIds) {
      await addToCart({
        userClient: user.client,
        productId: row!.id,
        lookId,
        slot: "top",
        revalidate: async () => "verified",
      });
    }

    const { error } = await admin.from("looks").delete().in("id", lookIds);
    expect(error).toBeNull();
    const lines = await getCartLines(user.client);
    expect(lines).toHaveLength(lookIds.length);
    expect(lines.every((l) => l.look === null && l.slot === "top")).toBe(true);
    expect(buildCartView(lines).groups.map((g) => g.key)).toEqual(["loose"]);
  });
});
