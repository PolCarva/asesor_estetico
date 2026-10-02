"use server";

import {
  type FavoriteTarget,
  removeFavorite,
  requireAuth,
  requirePremium,
  saveFavorite,
} from "@asesor/db";
import { createServerSupabaseClient } from "@asesor/db/server";
import { isAppError } from "@asesor/shared";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAnalytics } from "@/lib/analytics";
import { getLogger } from "@/lib/logger";
import { enforceRateLimit, rateLimiters } from "@/lib/rate-limit";

/**
 * Guardados (paso 10a, D19). Capas finas (D22) sobre `saveFavorite` / `removeFavorite`: los
 * looks se guardan con cualquier plan; los productos exigen Premium en el servidor (y en la
 * RLS). `look_saved` y `product_saved` salen desde acá (D20).
 */

export type FavoriteActionState =
  | { status: "idle" }
  | { status: "saved"; alreadySaved: boolean }
  | { status: "removed" }
  | { status: "paywall" }
  | { status: "error"; error: string };

const MESSAGES: Record<string, string> = {
  NOT_FOUND: "Eso ya no está disponible.",
  RATE_LIMITED: "Hiciste muchos cambios seguidos. Probá de nuevo en un rato.",
  AUTH_REQUIRED: "Tenés que iniciar sesión.",
  VALIDATION_FAILED: "No pudimos procesar el pedido.",
};

const empty = (value: unknown) => (value === "" ? undefined : value);

/** Exactamente uno: un look o un producto. */
const FavoriteFormSchema = z
  .object({
    lookId: z.preprocess(empty, z.uuid().optional()),
    productId: z.preprocess(empty, z.uuid().optional()),
  })
  .transform((d, ctx): FavoriteTarget => {
    if (d.lookId && !d.productId) return { lookId: d.lookId };
    if (d.productId && !d.lookId) return { productId: d.productId };
    ctx.addIssue({ code: "custom", message: "Un look o un producto." });
    return z.NEVER;
  });

function failure(error: unknown, fallback: string): FavoriteActionState {
  if (isAppError(error)) {
    if (error.code === "PREMIUM_REQUIRED") return { status: "paywall" };
    const message = MESSAGES[error.code];
    if (message) return { status: "error", error: message };
  }
  getLogger().error("falló una acción de guardados", { error });
  return { status: "error", error: fallback };
}

async function authorize(formData: FormData) {
  const supabase = await createServerSupabaseClient();
  const parsed = FavoriteFormSchema.safeParse(Object.fromEntries(formData));
  // Los productos son Premium aunque el pedido venga mal armado: se exige sesión antes.
  if (!parsed.success) {
    await requireAuth(supabase);
    return { supabase, target: null, userId: null };
  }
  const target = parsed.data;
  const user = target.productId ? await requirePremium(supabase) : await requireAuth(supabase);
  await enforceRateLimit(rateLimiters.cart, user.id);
  return { supabase, target, userId: user.id };
}

/** El ♡ está en varias pantallas (looks, detalle, carrito, guardados): se refresca todo /app. */
function revalidate() {
  revalidatePath("/app", "layout");
}

export async function saveFavoriteAction(
  _prev: FavoriteActionState,
  formData: FormData,
): Promise<FavoriteActionState> {
  try {
    const { supabase, target, userId } = await authorize(formData);
    if (!target || !userId) return { status: "error", error: MESSAGES.VALIDATION_FAILED! };
    const saved = await saveFavorite({ userClient: supabase, target });
    if (!saved.alreadySaved) {
      await getAnalytics().trackEvent(target.lookId ? "look_saved" : "product_saved", {
        userId,
        path: "/app/favorites",
        properties: target.lookId
          ? { look_id: target.lookId }
          : { product_id: target.productId!, store_domain: saved.storeDomain },
      });
    }
    revalidate();
    return { status: "saved", alreadySaved: saved.alreadySaved };
  } catch (error) {
    return failure(error, "No pudimos guardarlo. Probá de nuevo.");
  }
}

export async function removeFavoriteAction(
  _prev: FavoriteActionState,
  formData: FormData,
): Promise<FavoriteActionState> {
  try {
    const { supabase, target } = await authorize(formData);
    if (!target) return { status: "error", error: MESSAGES.VALIDATION_FAILED! };
    await removeFavorite({ userClient: supabase, target });
    revalidate();
    return { status: "removed" };
  } catch (error) {
    return failure(error, "No pudimos quitarlo de guardados. Probá de nuevo.");
  }
}
