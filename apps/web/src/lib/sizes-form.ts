import type { UserSizesUpdate } from "@asesor/db";
import { ShoeSizeSystemSchema } from "@asesor/shared";
import { z } from "zod";

/**
 * Campos de talles de un formulario (radios `top`, `bottom`, `shoe`, `shoe_size_system`).
 * Solo vienen los que se pidieron; los valores se validan contra las opciones al guardar
 * (`saveUserSizes`).
 */
const size = z.string().trim().min(1).max(10).optional();

export const SizesFormSchema = z.object({
  lookId: z.uuid().optional(),
  requestId: z.uuid().optional(),
  top: size,
  bottom: size,
  shoe: size,
  shoe_size_system: ShoeSizeSystemSchema.optional(),
});
export type SizesForm = z.infer<typeof SizesFormSchema>;

/** Lo que hay que guardar: solo los talles elegidos (el sistema del calzado, con su número). */
export function sizesUpdateFrom(form: SizesForm): UserSizesUpdate {
  const update: UserSizesUpdate = {};
  if (form.top) update.top = form.top;
  if (form.bottom) update.bottom = form.bottom;
  if (form.shoe) {
    update.shoe = form.shoe;
    update.shoe_size_system = form.shoe_size_system ?? "EU";
  }
  return update;
}
