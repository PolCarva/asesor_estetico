"use server";

import { enqueueJob, requireAuth } from "@asesor/db";
import { createServerSupabaseClient } from "@asesor/db/server";
import { getServiceRoleClient } from "@asesor/db/service";
import {
  isAppError,
  MAX_ANALYSES_PER_DAY,
  StyleRiskLevelSchema,
  TattooPreferenceSchema,
} from "@asesor/shared";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { getAnalytics } from "@/lib/analytics";
import { getLogger } from "@/lib/logger";

export type AnalysisActionState = { error: string | null; ok?: boolean };

const StartAnalysisSchema = z.object({
  style_risk_level: StyleRiskLevelSchema,
  tattoo_preference: TattooPreferenceSchema,
});

/**
 * Guarda las preferencias y encola VALIDATE_PHOTOS. El worker sigue con el análisis
 * y la generación de looks. Límites: un análisis a la vez y MAX_ANALYSES_PER_DAY por día.
 */
export async function startAnalysisAction(
  _prev: AnalysisActionState,
  formData: FormData,
): Promise<AnalysisActionState> {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await requireAuth(supabase);
    const prefs = StartAnalysisSchema.safeParse(Object.fromEntries(formData));
    if (!prefs.success) return { error: "Elegí tus preferencias de estilo." };

    const { data: photos } = await supabase
      .from("user_photos")
      .select("id, type")
      .eq("user_id", user.id);
    const main = photos?.find((p) => p.type === "MAIN_BODY");
    const face = photos?.find((p) => p.type === "FACE_DETAIL");
    if (!main || !face) return { error: "Subí tus dos fotos antes de analizar." };

    const { error: prefsError } = await supabase
      .from("profiles")
      .update(prefs.data)
      .eq("id", user.id);
    if (prefsError) throw prefsError;

    // Las colas solo se escriben con service role, después de autorizar al usuario.
    const service = getServiceRoleClient();
    const pipeline = ["VALIDATE_PHOTOS", "ANALYZE_STYLE_PROFILE"] as const;
    const { count: running } = await service
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .in("type", [...pipeline])
      .in("status", ["QUEUED", "RUNNING"]);
    if ((running ?? 0) > 0) return { error: "Ya hay un análisis en curso." };

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: today } = await service
      .from("jobs")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("type", "VALIDATE_PHOTOS")
      .gte("created_at", since);
    if ((today ?? 0) >= MAX_ANALYSES_PER_DAY) {
      return {
        error: `Llegaste al máximo de ${MAX_ANALYSES_PER_DAY} análisis por día. Probá mañana.`,
      };
    }

    await enqueueJob(service, {
      type: "VALIDATE_PHOTOS",
      payload: {
        user_id: user.id,
        photos: [
          { photo_id: main.id, type: "MAIN_BODY" },
          { photo_id: face.id, type: "FACE_DETAIL" },
        ],
      },
      userId: user.id,
      priority: 10,
    });
    await getAnalytics().trackEvent("analysis_started", { userId: user.id });
    revalidatePath("/app/onboarding");
    return { error: null, ok: true };
  } catch (error) {
    if (isAppError(error) && error.code === "AUTH_REQUIRED") return { error: error.message };
    getLogger().error("no se pudo iniciar el análisis", { error });
    return { error: "No pudimos iniciar el análisis. Probá de nuevo." };
  }
}
