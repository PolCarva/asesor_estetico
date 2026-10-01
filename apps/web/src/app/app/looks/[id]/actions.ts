"use server";

import {
  getUserSizes,
  MISSING_SIZES,
  requirePremium,
  saveUserSizes,
  startLookShopping,
} from "@asesor/db";
import { createServerSupabaseClient } from "@asesor/db/server";
import { getServiceRoleClient } from "@asesor/db/service";
import { isAppError } from "@asesor/shared";
import { revalidatePath } from "next/cache";

import { getAnalytics } from "@/lib/analytics";
import { getLogger } from "@/lib/logger";
import { enforceRateLimit, rateLimiters } from "@/lib/rate-limit";
import { SizesFormSchema, sizesUpdateFrom } from "@/lib/sizes-form";

export type LookShoppingActionState =
  | { status: "idle" }
  | { status: "queued" | "already_running"; jobId: string }
  | { status: "paywall" }
  | { status: "needs_sizes" }
  | { status: "error"; error: string };

const MESSAGES = {
  AUTH_REQUIRED: "Tenés que iniciar sesión.",
  NOT_FOUND: "No encontramos ese look.",
  RATE_LIMITED: "Hiciste muchas búsquedas seguidas. Probá de nuevo en un rato.",
  VALIDATION_FAILED: "Revisá los talles elegidos.",
} as const;

/**
 * "Encontrar este look": guarda los talles que el usuario acaba de elegir (si el
 * formulario los trae) y encola la búsqueda de productos, en un solo paso. Capa fina (D22):
 * Premium en el servidor (el botón oculto no alcanza), Zod, rate limit y analytics; la
 * lógica (dueño del look, talles relevantes, una búsqueda activa, cola) vive en
 * `startLookShopping`. No espera a la búsqueda: el progreso se lee del job.
 */
export async function startLookShoppingAction(
  _prev: LookShoppingActionState,
  formData: FormData,
): Promise<LookShoppingActionState> {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await requirePremium(supabase);
    const form = SizesFormSchema.safeParse(Object.fromEntries(formData));
    if (!form.success || !form.data.lookId) return { status: "error", error: MESSAGES.NOT_FOUND };
    const { lookId, requestId } = form.data;

    const update = sizesUpdateFrom(form.data);
    if (Object.keys(update).length > 0) await saveUserSizes(supabase, user.id, update);
    const sizes = await getUserSizes(supabase, user.id);
    await enforceRateLimit(rateLimiters.shoppingSearch, user.id);

    const started = await startLookShopping({
      userClient: supabase,
      serviceClient: getServiceRoleClient(),
      lookId,
      sizes,
      requestId: requestId ?? crypto.randomUUID(),
    });
    if (!started.alreadyRunning) {
      await getAnalytics().trackEvent("shopping_started", {
        userId: user.id,
        path: `/app/looks/${lookId}`,
        properties: { look_id: lookId, mode: started.mode },
      });
    }
    revalidatePath(`/app/looks/${lookId}`);
    return {
      status: started.alreadyRunning ? "already_running" : "queued",
      jobId: started.jobId,
    };
  } catch (error) {
    if (isAppError(error)) {
      // Free (o Premium vencido): paywall, sin error técnico.
      if (error.code === "PREMIUM_REQUIRED") return { status: "paywall" };
      if (error.code === "VALIDATION_FAILED" && error.message === MISSING_SIZES) {
        return { status: "needs_sizes" };
      }
      if (error.code in MESSAGES) {
        return { status: "error", error: MESSAGES[error.code as keyof typeof MESSAGES] };
      }
    }
    getLogger().error("no se pudo iniciar la búsqueda de productos", { error });
    return { status: "error", error: "No pudimos iniciar la búsqueda. Probá de nuevo." };
  }
}
