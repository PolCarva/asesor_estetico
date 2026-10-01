"use server";

import { requirePremium, startLookShopping } from "@asesor/db";
import { createServerSupabaseClient } from "@asesor/db/server";
import { getServiceRoleClient } from "@asesor/db/service";
import { EMPTY_USER_SIZES, isAppError, UserSizesSchema } from "@asesor/shared";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAnalytics } from "@/lib/analytics";
import { getLogger } from "@/lib/logger";
import { enforceRateLimit, rateLimiters } from "@/lib/rate-limit";

export type LookShoppingActionState =
  | { status: "queued" | "already_running"; jobId: string }
  | { status: "paywall" }
  | { status: "error"; error: string };

const StartLookShoppingSchema = z.object({
  lookId: z.uuid(),
  /** Talles del pedido (el paso 07 los guarda en el perfil y los manda acá). */
  sizes: UserSizesSchema.default(EMPTY_USER_SIZES),
  /** Id del pedido generado en el cliente: un doble envío no encola dos veces. */
  requestId: z.uuid().optional(),
});
export type StartLookShoppingActionInput = z.input<typeof StartLookShoppingSchema>;

const MESSAGES = {
  AUTH_REQUIRED: "Tenés que iniciar sesión.",
  NOT_FOUND: "No encontramos ese look.",
  RATE_LIMITED: "Hiciste muchas búsquedas seguidas. Probá de nuevo en un rato.",
  VALIDATION_FAILED: "No pudimos iniciar la búsqueda de ese look.",
} as const;

/**
 * Encola la búsqueda de productos reales de un look. Capa fina (D22): Premium en el servidor
 * (el botón oculto no alcanza), Zod, rate limit y analytics; la lógica (dueño del look, una
 * búsqueda activa, cola) vive en `startLookShopping`. No espera a la búsqueda: el progreso
 * se lee del job (`getLookShoppingState`).
 */
export async function startLookShoppingAction(
  input: StartLookShoppingActionInput,
): Promise<LookShoppingActionState> {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await requirePremium(supabase);
    const parsed = StartLookShoppingSchema.safeParse(input);
    if (!parsed.success) return { status: "error", error: MESSAGES.VALIDATION_FAILED };
    const { lookId, sizes, requestId } = parsed.data;
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
      if (error.code in MESSAGES) {
        return { status: "error", error: MESSAGES[error.code as keyof typeof MESSAGES] };
      }
    }
    getLogger().error("no se pudo iniciar la búsqueda de productos", { error });
    return { status: "error", error: "No pudimos iniciar la búsqueda. Probá de nuevo." };
  }
}
