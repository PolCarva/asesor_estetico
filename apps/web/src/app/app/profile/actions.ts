"use server";

import { requireAuth, saveUserSizes } from "@asesor/db";
import { createServerSupabaseClient } from "@asesor/db/server";
import { isAppError } from "@asesor/shared";
import { revalidatePath } from "next/cache";

import { getLogger } from "@/lib/logger";
import { SizesFormSchema, sizesUpdateFrom } from "@/lib/sizes-form";

export type SizesActionState = { error: string | null; ok?: boolean };

/** Edita los talles guardados en el perfil (cliente del usuario: RLS y grants por columna). */
export async function saveSizesAction(
  _prev: SizesActionState,
  formData: FormData,
): Promise<SizesActionState> {
  try {
    const supabase = await createServerSupabaseClient();
    const user = await requireAuth(supabase);
    const form = SizesFormSchema.safeParse(Object.fromEntries(formData));
    if (!form.success) return { error: "Revisá los talles elegidos." };
    const update = sizesUpdateFrom(form.data);
    if (Object.keys(update).length === 0) return { error: "Elegí al menos un talle." };
    await saveUserSizes(supabase, user.id, update);
    revalidatePath("/app/profile");
    return { error: null, ok: true };
  } catch (error) {
    if (isAppError(error) && error.code === "AUTH_REQUIRED") return { error: error.message };
    if (isAppError(error) && error.code === "VALIDATION_FAILED") {
      return { error: "Revisá los talles elegidos." };
    }
    getLogger().error("no se pudieron guardar los talles", { error });
    return { error: "No pudimos guardar tus talles. Probá de nuevo." };
  }
}
