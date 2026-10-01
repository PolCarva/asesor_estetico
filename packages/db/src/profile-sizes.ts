import {
  AppError,
  EMPTY_USER_SIZES,
  isSizeOption,
  type ShoeSizeSystem,
  ShoeSizeSystemSchema,
  type SizeKind,
  type UserSizes,
  UserSizesSchema,
} from "@asesor/shared";

import type { TypedSupabaseClient, Update } from "./types";

/**
 * Talles del usuario en `profiles` (paso 07, D15). Con el cliente del usuario: la RLS
 * ("profiles: update own") y los grants por columna limitan a su fila y a estas columnas.
 */

const COLUMNS = "top_size, bottom_size, shoe_size, shoe_size_system";

/** Talles guardados. Lo que no cargó vuelve en null (sistema de calzado EU por defecto). */
export async function getUserSizes(
  client: TypedSupabaseClient,
  userId: string,
): Promise<UserSizes> {
  const { data, error } = await client
    .from("profiles")
    .select(COLUMNS)
    .eq("id", userId)
    .maybeSingle();
  if (error) throw new AppError("INTERNAL", "No se pudieron leer los talles.", { cause: error });
  if (!data) return EMPTY_USER_SIZES;
  const parsed = UserSizesSchema.safeParse({
    top: data.top_size,
    bottom: data.bottom_size,
    shoe: data.shoe_size,
    shoe_size_system: data.shoe_size_system,
  });
  return parsed.success ? parsed.data : EMPTY_USER_SIZES;
}

/** Talles a guardar: `undefined` no toca la columna; `null` la borra. */
export type UserSizesUpdate = Partial<UserSizes>;

/**
 * Guarda los talles que vienen, validados contra las opciones que se ofrecen
 * (`SIZE_OPTIONS`). El número de calzado va siempre con su sistema. Devuelve lo guardado.
 */
export async function saveUserSizes(
  client: TypedSupabaseClient,
  userId: string,
  input: UserSizesUpdate,
): Promise<UserSizes> {
  const invalid = () => new AppError("VALIDATION_FAILED", "Talle inválido.");
  const system: ShoeSizeSystem | undefined = input.shoe_size_system;
  if (system !== undefined && !ShoeSizeSystemSchema.safeParse(system).success) throw invalid();
  if (input.shoe && !system) throw invalid();

  const update: Update<"profiles"> = {};
  const column = { top: "top_size", bottom: "bottom_size", shoe: "shoe_size" } as const;
  for (const kind of ["top", "bottom", "shoe"] as const satisfies readonly SizeKind[]) {
    const value = input[kind];
    if (value === undefined) continue;
    if (value !== null && !isSizeOption(kind, value, system)) throw invalid();
    update[column[kind]] = value;
  }
  if (system) update.shoe_size_system = system;
  if (Object.keys(update).length === 0) return getUserSizes(client, userId);

  const { data, error } = await client
    .from("profiles")
    .update(update)
    .eq("id", userId)
    .select(COLUMNS)
    .maybeSingle();
  if (error) throw new AppError("INTERNAL", "No se pudieron guardar los talles.", { cause: error });
  if (!data) throw new AppError("NOT_FOUND", "Perfil inexistente.");
  return UserSizesSchema.parse({
    top: data.top_size,
    bottom: data.bottom_size,
    shoe: data.shoe_size,
    shoe_size_system: data.shoe_size_system,
  });
}
