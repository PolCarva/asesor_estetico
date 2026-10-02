import {
  AppError,
  type Currency,
  type GarmentSlot,
  type JobStatus,
  listLookGarments,
  missingSizesForLook,
  SearchProductsPayloadSchema,
  sizeKindForCategory,
  type ShoppingProgress,
  ShoppingProgressSchema,
  StoredLookSpecSchema,
  type UserSizes,
} from "@asesor/shared";

import { requirePremium } from "./auth";
import { enqueueJob } from "./jobs";
import type { JobRow, TypedSupabaseClient } from "./types";

/**
 * Inicio y estado de la búsqueda de productos de un look (paso 06, D13 y D22). La server
 * action de la web es una capa fina sobre esto; acá se prueba con integración.
 */

/** Interactiva: debajo del análisis y del look gratis (10), arriba de los looks Premium (5). */
export const SHOPPING_SEARCH_PRIORITY = 8;
/** Pocos intentos: el usuario está esperando y las fallas parciales se toleran adentro. */
export const SHOPPING_SEARCH_MAX_ATTEMPTS = 2;

const ACTIVE: JobStatus[] = ["QUEUED", "RUNNING"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mensaje de `VALIDATION_FAILED` cuando faltan talles relevantes: la UI los pide. */
export const MISSING_SIZES = "MISSING_SIZES";
/** Mensaje de `VALIDATION_FAILED` cuando el producto no tiene precio ("más barato" no aplica). */
export const NO_PRICE = "NO_PRICE";

export interface StartLookShoppingInput {
  /** Cliente con la sesión del usuario: Premium y dueño del look pasan por su RLS. */
  userClient: TypedSupabaseClient;
  /** Service role: solo para leer y escribir la cola, después de autorizar. */
  serviceClient: TypedSupabaseClient;
  lookId: string;
  sizes: UserSizes;
  /** Una sola prenda ("Buscar más barato", paso 09). Sin slot, el look completo. */
  slot?: GarmentSlot;
  /** Tope estricto de precio (solo con slot). */
  maxPrice?: { amount: number; currency: Currency };
  /** "Buscar más barato" (paso 09): las alternativas se guardan aparte, más baratas que este. */
  referenceProductId?: string;
  /** Id del pedido (idempotencia): el mismo pedido no encola dos veces. */
  requestId: string;
  now?: Date;
}

export interface StartLookShoppingResult {
  jobId: string;
  /** true: ya había una búsqueda activa para ese look (o esa prenda) y se devuelve esa. */
  alreadyRunning: boolean;
  mode: "LOOK" | "SLOT";
}

async function findActiveSearch(
  service: TypedSupabaseClient,
  input: { userId: string; lookId: string; slot?: GarmentSlot },
) {
  let query = service
    .from("jobs")
    .select("id")
    .eq("type", "SEARCH_PRODUCTS")
    .eq("user_id", input.userId)
    .eq("look_id", input.lookId)
    .in("status", ACTIVE);
  query = input.slot ? query.eq("garment_slot", input.slot) : query.is("garment_slot", null);
  const { data, error } = await query.limit(1).maybeSingle();
  if (error) throw new AppError("INTERNAL", "No se pudo leer la cola.", { cause: error });
  return data;
}

function isUniqueViolation(error: unknown): boolean {
  const cause = error instanceof Error ? (error.cause as { code?: unknown } | undefined) : null;
  return cause?.code === "23505";
}

/**
 * Encola la búsqueda de productos de un look. Verifica sesión, Premium y que el look sea
 * del usuario y que estén los talles relevantes; permite una sola búsqueda activa por
 * (look, prenda): la del look completo no bloquea la de una prenda. Errores: AUTH_REQUIRED,
 * PREMIUM_REQUIRED, NOT_FOUND (look ajeno o inexistente) y VALIDATION_FAILED (con el
 * mensaje `MISSING_SIZES` si faltan talles).
 */
export async function startLookShopping(
  input: StartLookShoppingInput,
): Promise<StartLookShoppingResult> {
  const user = await requirePremium(input.userClient, input.now);
  const payload = SearchProductsPayloadSchema.safeParse({
    user_id: user.id,
    look_id: input.lookId,
    sizes: input.sizes,
    slot: input.slot,
    max_price: input.maxPrice,
    reference_product_id: input.referenceProductId,
  });
  if (!payload.success || !UUID.test(input.requestId)) {
    throw new AppError("VALIDATION_FAILED", "Pedido de búsqueda inválido.");
  }
  const { look_id: lookId, slot } = payload.data;

  const { data: look, error } = await input.userClient
    .from("looks")
    .select("id, spec_json")
    .eq("id", lookId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (error) throw new AppError("INTERNAL", "No se pudo leer el look.", { cause: error });
  if (!look) throw new AppError("NOT_FOUND", "Look inexistente.");
  const spec = StoredLookSpecSchema.safeParse(look.spec_json);
  if (!spec.success) throw new AppError("VALIDATION_FAILED", "El look no se puede buscar.");
  const garment = slot ? listLookGarments(spec.data).find((g) => g.slot === slot) : undefined;
  if (slot && !garment) throw new AppError("VALIDATION_FAILED", "Esa prenda no está en el look.");
  // SPEC "TALLES": antes de buscar, los talles relevantes del look (o de esa prenda).
  const missing = garment
    ? [sizeKindForCategory(garment.garment.category)].filter(
        (kind) => kind !== null && !payload.data.sizes[kind],
      )
    : missingSizesForLook(spec.data, payload.data.sizes);
  if (missing.length > 0) throw new AppError("VALIDATION_FAILED", MISSING_SIZES);

  const mode = slot ? "SLOT" : "LOOK";
  const scope = { userId: user.id, lookId, slot };
  const active = await findActiveSearch(input.serviceClient, scope);
  if (active) return { jobId: active.id, alreadyRunning: true, mode };

  try {
    const job = await enqueueJob(input.serviceClient, {
      type: "SEARCH_PRODUCTS",
      payload: payload.data,
      userId: user.id,
      priority: SHOPPING_SEARCH_PRIORITY,
      maxAttempts: SHOPPING_SEARCH_MAX_ATTEMPTS,
      idempotencyKey: `search:${lookId}:${slot ?? "look"}:${input.requestId.toLowerCase()}`,
    });
    return { jobId: job.id, alreadyRunning: false, mode };
  } catch (enqueueError) {
    // Carrera con otro pedido: el índice único de búsquedas activas rechazó el segundo.
    if (isUniqueViolation(enqueueError)) {
      const winner = await findActiveSearch(input.serviceClient, scope);
      if (winner) return { jobId: winner.id, alreadyRunning: true, mode };
    }
    throw enqueueError;
  }
}

export interface LookSearchState {
  jobId: string;
  status: JobStatus;
  /** null hasta que el worker la toma (o si el progreso guardado no es válido). */
  progress: ShoppingProgress | null;
  createdAt: string;
  finishedAt: string | null;
}

/**
 * Última búsqueda de un look (o de una prenda) con su progreso. Con el cliente del usuario,
 * la RLS solo devuelve sus propios jobs y las columnas no sensibles (nunca payload, result
 * ni last_error).
 */
export async function getLatestLookSearch(
  client: TypedSupabaseClient,
  lookId: string,
  options: { slot?: GarmentSlot } = {},
): Promise<LookSearchState | null> {
  let query = client
    .from("jobs")
    .select("id, status, progress, created_at, finished_at")
    .eq("type", "SEARCH_PRODUCTS")
    .eq("look_id", lookId);
  query = options.slot ? query.eq("garment_slot", options.slot) : query.is("garment_slot", null);
  const { data, error } = await query
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new AppError("INTERNAL", "No se pudo leer la búsqueda.", { cause: error });
  if (!data) return null;
  const progress = ShoppingProgressSchema.safeParse(data.progress);
  return {
    jobId: data.id,
    status: data.status,
    progress: progress.success ? progress.data : null,
    createdAt: data.created_at,
    finishedAt: data.finished_at,
  };
}

export interface StartCheaperSearchInput {
  userClient: TypedSupabaseClient;
  serviceClient: TypedSupabaseClient;
  lookId: string;
  /** uuid de `products`: un resultado (principal o "más barato") de ese look. */
  productId: string;
  sizes: UserSizes;
  requestId: string;
  now?: Date;
}

export interface StartCheaperSearchResult extends StartLookShoppingResult {
  slot: GarmentSlot;
  /** Precio del producto de referencia: el tope estricto de la búsqueda. */
  price: { amount: number; currency: Currency };
}

/**
 * "Buscar más barato" (paso 09, D17): una sola prenda, con los mismos atributos estéticos de
 * la prenda del look y el precio del producto como tope estricto (menor). No regenera el look
 * ni toca el ranking principal: el worker guarda las alternativas como "más baratas". El
 * producto tiene que ser un resultado de ese look (RLS: dueño Premium) y tener precio.
 * Errores: los de `startLookShopping` y VALIDATION_FAILED con `NO_PRICE`.
 */
export async function startCheaperSearch(
  input: StartCheaperSearchInput,
): Promise<StartCheaperSearchResult> {
  await requirePremium(input.userClient, input.now);
  if (!UUID.test(input.lookId) || !UUID.test(input.productId)) {
    throw new AppError("VALIDATION_FAILED", "Pedido de búsqueda inválido.");
  }
  const { data, error } = await input.userClient
    .from("look_products")
    .select("garment_slot, products!look_products_product_id_fkey (price_amount, currency)")
    .eq("look_id", input.lookId)
    .eq("product_id", input.productId)
    .limit(1)
    .maybeSingle();
  if (error) throw new AppError("INTERNAL", "No se pudo leer el producto.", { cause: error });
  if (!data) throw new AppError("NOT_FOUND", "Ese producto no está en el look.");
  const amount = data.products?.price_amount;
  const currency = data.products?.currency;
  if (amount === null || amount === undefined || !currency) {
    throw new AppError("VALIDATION_FAILED", NO_PRICE);
  }
  const price = { amount: Number(amount), currency };
  const slot = data.garment_slot;
  const started = await startLookShopping({
    userClient: input.userClient,
    serviceClient: input.serviceClient,
    lookId: input.lookId,
    sizes: input.sizes,
    slot,
    maxPrice: price,
    referenceProductId: input.productId,
    requestId: input.requestId,
    now: input.now,
  });
  return { ...started, slot, price };
}

/**
 * Última búsqueda de cada prenda suelta de un look ("más barato"), por slot. Con el cliente
 * del usuario: la RLS solo devuelve sus jobs.
 */
export async function getSlotSearches(
  client: TypedSupabaseClient,
  lookId: string,
): Promise<Map<string, LookSearchState>> {
  const { data, error } = await client
    .from("jobs")
    .select("id, status, progress, created_at, finished_at, garment_slot")
    .eq("type", "SEARCH_PRODUCTS")
    .eq("look_id", lookId)
    .not("garment_slot", "is", null)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new AppError("INTERNAL", "No se pudieron leer las búsquedas.", { cause: error });
  const bySlot = new Map<string, LookSearchState>();
  for (const row of data ?? []) {
    if (!row.garment_slot || bySlot.has(row.garment_slot)) continue;
    const progress = ShoppingProgressSchema.safeParse(row.progress);
    bySlot.set(row.garment_slot, {
      jobId: row.id,
      status: row.status,
      progress: progress.success ? progress.data : null,
      createdAt: row.created_at,
      finishedAt: row.finished_at,
    });
  }
  return bySlot;
}

// --- Revalidación de productos (REFRESH_PRODUCT) ----------------------------------------

/** Revalidar un producto va antes que las búsquedas (8): el usuario está por comprar. */
export const PRODUCT_REFRESH_PRIORITY = 9;
export const PRODUCT_REFRESH_MAX_ATTEMPTS = 2;
/**
 * Cuánto espera el carrito una revalidación (paso 10a). El worker toma el job en ≤1 s si tiene
 * un carril libre y una página de producto tarda 1–3 s; si está ocupado con búsquedas, el
 * carrito sigue con el dato que hay y lo dice.
 */
export const PRODUCT_REFRESH_WAIT_MS = 8_000;

/**
 * Encola la revalidación de un producto, una por producto y hora (clave de idempotencia): un
 * pedido repetido, o una tienda que viene fallando, no se vuelve a consultar dentro de la
 * misma hora. Lo usan "Comprar ↗" (paso 08) y el carrito (paso 10a).
 */
export async function enqueueProductRefresh(
  service: TypedSupabaseClient,
  productId: string,
  now: Date = new Date(),
): Promise<JobRow> {
  return enqueueJob(service, {
    type: "REFRESH_PRODUCT",
    payload: { product_id: productId },
    priority: PRODUCT_REFRESH_PRIORITY,
    maxAttempts: PRODUCT_REFRESH_MAX_ATTEMPTS,
    idempotencyKey: `refresh:${productId}:${now.toISOString().slice(0, 13)}`,
  });
}

/**
 * Resultado de revalidar un producto: `verified` (precio, stock y talles de hoy), `gone` (la
 * tienda lo sacó), `failed` (la tienda no respondió: el stock quedó `UNKNOWN` y la fecha no
 * avanzó) o `pending` (no terminó a tiempo: el job sigue y actualiza el producto después).
 */
export type ProductRefreshOutcome = "verified" | "gone" | "failed" | "pending";

const REFRESH_STATUSES = ["verified", "gone", "failed"] as const;

function refreshOutcome(job: Pick<JobRow, "status" | "result">): ProductRefreshOutcome | null {
  if (job.status === "COMPLETED") {
    // `result` lo escribe el worker: { product_id, status, availability }.
    const status =
      job.result && typeof job.result === "object" && !Array.isArray(job.result)
        ? job.result.status
        : null;
    return REFRESH_STATUSES.find((s) => s === status) ?? "failed";
  }
  return job.status === "FAILED" ? "failed" : null;
}

/**
 * Revalida un producto con el worker (la web nunca descarga páginas de tiendas) y espera el
 * resultado un tiempo corto. Si el job de esta hora ya terminó, devuelve ese resultado sin
 * volver a consultar la tienda.
 */
export async function waitForProductRefresh(
  service: TypedSupabaseClient,
  productId: string,
  options: { timeoutMs?: number; pollMs?: number; now?: Date } = {},
): Promise<ProductRefreshOutcome> {
  const deadline = Date.now() + (options.timeoutMs ?? PRODUCT_REFRESH_WAIT_MS);
  const pollMs = options.pollMs ?? 250;
  let job: Pick<JobRow, "id" | "status" | "result"> = await enqueueProductRefresh(
    service,
    productId,
    options.now,
  );
  for (;;) {
    const outcome = refreshOutcome(job);
    if (outcome) return outcome;
    const left = deadline - Date.now();
    if (left <= 0) return "pending";
    await new Promise((resolve) => setTimeout(resolve, Math.min(pollMs, left)));
    const { data, error } = await service
      .from("jobs")
      .select("id, status, result")
      .eq("id", job.id)
      .maybeSingle();
    if (error) throw new AppError("INTERNAL", "No se pudo leer la revalidación.", { cause: error });
    if (!data) return "failed";
    job = data;
  }
}
