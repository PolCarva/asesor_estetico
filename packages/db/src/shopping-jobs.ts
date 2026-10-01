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
import type { TypedSupabaseClient } from "./types";

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
