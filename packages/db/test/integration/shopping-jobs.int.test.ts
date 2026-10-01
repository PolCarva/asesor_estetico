import {
  EMPTY_USER_SIZES,
  type Product,
  type RankedProduct,
  splitStyleProfile,
  type UserSizes,
} from "@asesor/shared";
import {
  FIXTURE_IN_STORE_PRODUCT,
  FIXTURE_LOOK_SPECS,
  FIXTURE_PRODUCTS,
  FIXTURE_STYLE_PROFILE,
} from "@asesor/shared/fixtures";
import { afterAll, beforeAll, expect, it } from "vitest";

import { enqueueJob, updateJobProgress } from "../../src/jobs";
import { getLookProducts, saveCheaperProducts, saveLookProducts } from "../../src/shopping";
import {
  getLatestLookSearch,
  getSlotSearches,
  MISSING_SIZES,
  NO_PRICE,
  SHOPPING_SEARCH_MAX_ATTEMPTS,
  SHOPPING_SEARCH_PRIORITY,
  startCheaperSearch,
  startLookShopping,
} from "../../src/shopping-jobs";
import { toJson } from "../../src/types";
import { adminClient, createTestUser, deleteTestUser, describeIntegration } from "./setup";

/**
 * Inicio de la búsqueda de productos y progreso de los jobs (paso 06). Ningún test toma
 * jobs de la cola: los "en curso" se marcan a mano, así un worker o un test que reclame
 * por tipo nunca los agarra.
 */
describeIntegration("shopping: inicio de la búsqueda y progreso", () => {
  const admin = adminClient();
  const sizes: UserSizes = { ...EMPTY_USER_SIZES, top: "M", bottom: "42", shoe: "42" };
  let premium: Awaited<ReturnType<typeof createTestUser>>;
  let free: Awaited<ReturnType<typeof createTestUser>>;
  let other: Awaited<ReturnType<typeof createTestUser>>;
  let looks: string[] = [];
  let otherLook = "";

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

  async function makePremium(userId: string) {
    const { error } = await admin.from("subscriptions").insert({
      user_id: userId,
      provider: "MOCK",
      provider_subscription_id: `test-${userId}`,
      status: "ACTIVE",
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(error).toBeNull();
  }

  const searchJobs = async (userId: string) => {
    const { data } = await admin
      .from("jobs")
      .select("id, status, look_id, garment_slot, priority, max_attempts, payload")
      .eq("user_id", userId)
      .eq("type", "SEARCH_PRODUCTS")
      .order("created_at");
    return data ?? [];
  };

  const start = (lookId: string, extra: { slot?: string; requestId?: string } = {}) =>
    startLookShopping({
      userClient: premium.client,
      serviceClient: admin,
      lookId,
      sizes,
      slot: extra.slot,
      requestId: extra.requestId ?? crypto.randomUUID(),
    });

  beforeAll(async () => {
    premium = await createTestUser("search-premium");
    free = await createTestUser("search-free");
    other = await createTestUser("search-other");
    looks = await createLooks(premium.id);
    await createLooks(free.id);
    otherLook = (await createLooks(other.id))[0]!;
    await makePremium(premium.id);
    await makePremium(other.id);
  });

  const tag = crypto.randomUUID().slice(0, 8);
  const tagged = (p: Product, suffix = ""): Product => ({
    ...p,
    id: `${p.id}-${tag}${suffix}`,
    url: `${p.url}-${tag}${suffix}`,
  });
  const ranked = (list: Product[]): RankedProduct[] =>
    list.map((product, i) => ({
      product,
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

  afterAll(async () => {
    // Jobs y resultados se borran en cascada con el usuario; los productos, por su URL.
    for (const user of [premium, free, other]) if (user) await deleteTestUser(user.id);
    await admin.from("products").delete().like("url", `%-${tag}%`);
  });

  it("un usuario free recibe PREMIUM_REQUIRED y no se encola nada", async () => {
    const { data: freeLook } = await admin
      .from("looks")
      .select("id")
      .eq("user_id", free.id)
      .eq("position", 1)
      .single();
    await expect(
      startLookShopping({
        userClient: free.client,
        serviceClient: admin,
        lookId: freeLook!.id,
        sizes,
        requestId: crypto.randomUUID(),
      }),
    ).rejects.toMatchObject({ code: "PREMIUM_REQUIRED" });
    expect(await searchJobs(free.id)).toEqual([]);
  });

  it("Premium encola una búsqueda con prioridad, pocos intentos y look legible; no hay dos activas", async () => {
    const first = await start(looks[0]!);
    expect(first).toMatchObject({ alreadyRunning: false, mode: "LOOK" });

    const again = await start(looks[0]!);
    expect(again).toEqual({ jobId: first.jobId, alreadyRunning: true, mode: "LOOK" });

    // El mismo pedido (misma clave) tampoco duplica.
    const [job] = await searchJobs(premium.id);
    expect(job).toMatchObject({
      id: first.jobId,
      status: "QUEUED",
      look_id: looks[0],
      garment_slot: null,
      priority: SHOPPING_SEARCH_PRIORITY,
      max_attempts: SHOPPING_SEARCH_MAX_ATTEMPTS,
    });
    expect(job!.payload).toEqual({ user_id: premium.id, look_id: looks[0], sizes });

    // La del look completo no bloquea la de una prenda (paso 09), ni la de otro look.
    const slot = await start(looks[0]!, { slot: "top" });
    expect(slot).toMatchObject({ alreadyRunning: false, mode: "SLOT" });
    expect((await start(looks[0]!, { slot: "top" })).jobId).toBe(slot.jobId);
    expect((await start(looks[1]!)).alreadyRunning).toBe(false);

    // Terminada la búsqueda, se puede volver a buscar.
    await admin.from("jobs").update({ status: "COMPLETED" }).eq("id", first.jobId);
    const next = await start(looks[0]!);
    expect(next.alreadyRunning).toBe(false);
    expect(next.jobId).not.toBe(first.jobId);
  });

  it("dos pedidos simultáneos encolan una sola búsqueda (índice único de búsquedas activas)", async () => {
    const results = await Promise.all(
      Array.from({ length: 4 }, () => start(looks[2]!, { slot: "shoes" })),
    );
    expect(new Set(results.map((r) => r.jobId)).size).toBe(1);
    expect(results.filter((r) => !r.alreadyRunning).length).toBe(1);

    // Y la base lo impide aunque se saltee el chequeo previo.
    await expect(
      enqueueJob(admin, {
        type: "SEARCH_PRODUCTS",
        payload: { user_id: premium.id, look_id: looks[2]!, sizes, slot: "shoes" },
        userId: premium.id,
      }),
    ).rejects.toMatchObject({ cause: { code: "23505" } });
  });

  it("sin los talles relevantes del look no busca (paso 07); con una prenda, solo los suyos", async () => {
    const noShoes = { ...sizes, shoe: null };
    const without = (slot?: string) =>
      startLookShopping({
        userClient: premium.client,
        serviceClient: admin,
        lookId: looks[2]!,
        sizes: noShoes,
        slot,
        requestId: crypto.randomUUID(),
      });
    await expect(without()).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
      message: MISSING_SIZES,
    });
    // El reloj no tiene talle, y la camisa ya tiene el suyo.
    await expect(without("shoes")).rejects.toMatchObject({ message: MISSING_SIZES });
    expect((await without("top")).mode).toBe("SLOT");
    expect(
      (await searchJobs(premium.id)).filter((j) => j.look_id === looks[2] && !j.garment_slot),
    ).toEqual([]);
  });

  it("rechaza looks ajenos o inexistentes, prendas que no están en el look y pedidos inválidos", async () => {
    await expect(start(otherLook)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(start(crypto.randomUUID())).rejects.toMatchObject({ code: "NOT_FOUND" });
    // El look 1 del fixture no tiene un cuarto accesorio.
    await expect(start(looks[0]!, { slot: "accessory:4" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(start(looks[0]!, { requestId: "no-es-uuid" })).rejects.toMatchObject({
      code: "VALIDATION_FAILED",
    });
    await expect(start("no-es-uuid")).rejects.toMatchObject({ code: "VALIDATION_FAILED" });
    expect(
      (await searchJobs(premium.id)).filter((j) => j.look_id === otherLook || !j.look_id),
    ).toEqual([]);
  });

  it("update_job_progress: solo el worker que tiene el job; el dueño lee su progreso y nadie más", async () => {
    const { jobId } = await start(looks[1]!, { slot: "bottom" });
    const progress = {
      stage: "CHECKING_STORES",
      slots_total: 1,
      slots_done: 0,
      updated_at: new Date().toISOString(),
      summary: null,
    };

    // QUEUED: todavía no lo tiene nadie.
    await expect(
      updateJobProgress(admin, { jobId, workerId: "w-test", progress }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // En curso bajo "w-test" (a mano, sin reclamar de la cola).
    await admin
      .from("jobs")
      .update({ status: "RUNNING", locked_by: "w-test", locked_at: new Date().toISOString() })
      .eq("id", jobId);
    await expect(
      updateJobProgress(admin, { jobId, workerId: "otro-worker", progress }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await updateJobProgress(admin, { jobId, workerId: "w-test", progress });

    // Ni el dueño ni anon pueden ejecutar la función.
    const asOwner = await premium.client.rpc("update_job_progress", {
      p_job_id: jobId,
      p_worker_id: "w-test",
      p_progress: { stage: "RANKING" },
    });
    expect(asOwner.error?.code).toBe("42501");

    // El dueño lee estado y progreso de la búsqueda de esa prenda.
    const state = await getLatestLookSearch(premium.client, looks[1]!, { slot: "bottom" });
    expect(state).toMatchObject({ jobId, status: "RUNNING", progress });
    // Pero no payload, result ni last_error.
    const hidden = await premium.client.from("jobs").select("payload").eq("id", jobId);
    expect(hidden.error?.code).toBe("42501");
    const columns = await premium.client
      .from("jobs")
      .select("progress, look_id, garment_slot")
      .eq("id", jobId)
      .single();
    expect(columns.data).toMatchObject({ look_id: looks[1], garment_slot: "bottom" });

    // Otro usuario (también Premium) no ve el job.
    expect(await getLatestLookSearch(other.client, looks[1]!, { slot: "bottom" })).toBeNull();
    const { data: foreign } = await other.client.from("jobs").select("id").eq("id", jobId);
    expect(foreign).toEqual([]);

    // Nadie escribe progreso desde el cliente: authenticated no tiene UPDATE en jobs.
    const write = await premium.client
      .from("jobs")
      .update({ progress: { stage: "RANKING" } })
      .eq("id", jobId)
      .select("id");
    expect(write.error?.code).toBe("42501");
    const { data: after } = await admin.from("jobs").select("progress").eq("id", jobId).single();
    expect(after?.progress).toEqual(progress);
  });

  it("más barato: encola solo la prenda del producto, con su precio como tope estricto", async () => {
    const [crudo, blanca] = [tagged(FIXTURE_PRODUCTS[0]!), tagged(FIXTURE_PRODUCTS[1]!)];
    const local = tagged(FIXTURE_IN_STORE_PRODUCT);
    const look = looks[1]!;
    await saveLookProducts(admin, {
      lookId: look,
      slot: "top",
      items: ranked([crudo, blanca, local]),
    });
    const rows = await getLookProducts(admin, look);
    const id = (p: Product) => rows.find((r) => r.product.product.url === p.url)!.product.id;
    const cheaper = (productId: string, client = premium.client) =>
      startCheaperSearch({
        userClient: client,
        serviceClient: admin,
        lookId: look,
        productId,
        sizes,
        requestId: crypto.randomUUID(),
      });

    const first = await cheaper(id(crudo));
    expect(first).toMatchObject({
      alreadyRunning: false,
      mode: "SLOT",
      slot: "top",
      price: { amount: 1890, currency: "UYU" },
    });
    const { data: job } = await admin
      .from("jobs")
      .select("payload, garment_slot")
      .eq("id", first.jobId)
      .single();
    // La misma prenda del look (sus atributos los arma el worker desde el LookSpec), con el
    // precio actual como máximo y el producto de referencia.
    expect(job).toMatchObject({
      garment_slot: "top",
      payload: {
        slot: "top",
        max_price: { amount: 1890, currency: "UYU" },
        reference_product_id: id(crudo),
        sizes,
      },
    });
    // Idempotente: otra vez (o con otro producto de la misma prenda) devuelve la activa.
    expect(await cheaper(id(crudo))).toMatchObject({ jobId: first.jobId, alreadyRunning: true });
    expect((await cheaper(id(blanca))).jobId).toBe(first.jobId);
    expect((await getSlotSearches(premium.client, look)).get("top")?.jobId).toBe(first.jobId);

    // Sin precio no aplica; productos que no son de este look, tampoco.
    await expect(cheaper(id(local))).rejects.toMatchObject({ message: NO_PRICE });
    await expect(cheaper(crypto.randomUUID())).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(cheaper(id(crudo), other.client)).rejects.toMatchObject({ code: "NOT_FOUND" });
    // Free: rechazado antes de mirar nada, y sin jobs.
    await expect(cheaper(id(crudo), free.client)).rejects.toMatchObject({
      code: "PREMIUM_REQUIRED",
    });
    expect(await searchJobs(free.id)).toEqual([]);
  });

  it("las más baratas van aparte: no pisan el ranking, no lo repiten y se reemplazan", async () => {
    const look = looks[2]!;
    const [crudo, blanca, chino] = [0, 1, 2].map((i) => tagged(FIXTURE_PRODUCTS[i]!, "-c"));
    const barata = {
      ...tagged(FIXTURE_PRODUCTS[1]!, "-barata"),
      price: { amount: 590, currency: "UYU" as const },
    };
    await saveLookProducts(admin, { lookId: look, slot: "top", items: ranked([crudo!, blanca!]) });
    const main = await getLookProducts(admin, look);
    const ref = main.find((r) => r.product.product.url === crudo!.url)!.product.id;

    // blanca ya está en el ranking principal: no se repite; las más baratas se renumeran.
    const saved = await saveCheaperProducts(admin, {
      lookId: look,
      slot: "top",
      referenceProductId: ref,
      maxPrice: { amount: 1890, currency: "UYU" },
      items: ranked([blanca!, barata, chino!]),
      userSize: "M",
    });
    expect(saved).toBe(2);
    const rows = await getLookProducts(premium.client, look);
    const lists = rows.map((r) => [r.list, r.rank, r.product.product.url]);
    expect(lists).toEqual([
      ["MAIN", 1, crudo!.url],
      ["MAIN", 2, blanca!.url],
      ["CHEAPER", 1, barata.url],
      ["CHEAPER", 2, chino!.url],
    ]);
    expect(rows.find((r) => r.list === "CHEAPER")?.cheaperThan).toEqual({
      productId: ref,
      maxPrice: { amount: 1890, currency: "UYU" },
    });

    // Otro pedido reemplaza las más baratas de la prenda; el ranking principal queda.
    await saveCheaperProducts(admin, {
      lookId: look,
      slot: "top",
      referenceProductId: ref,
      maxPrice: { amount: 1890, currency: "UYU" },
      items: ranked([barata]),
    });
    expect((await getLookProducts(admin, look)).map((r) => r.list)).toEqual([
      "MAIN",
      "MAIN",
      "CHEAPER",
    ]);
    // Una búsqueda nueva de la prenda (ranking principal) descarta sus más baratas.
    await saveLookProducts(admin, { lookId: look, slot: "top", items: ranked([crudo!]) });
    expect((await getLookProducts(admin, look)).map((r) => r.list)).toEqual(["MAIN"]);

    // Nadie las escribe desde el cliente.
    const rpc = await premium.client.rpc("replace_cheaper_look_products", {
      p_look_id: look,
      p_slot: "top",
      p_reference_product_id: ref,
      p_max_price_amount: 1,
      p_max_price_currency: "UYU",
      p_items: [],
    });
    expect(rpc.error?.code).toBe("42501");
  });
});
