import type { SupabaseClient } from "@supabase/supabase-js";

import type { Database, Json } from "./database.types";

export type { Database, Json } from "./database.types";

export type TypedSupabaseClient = SupabaseClient<Database>;

type PublicSchema = Database["public"];
export type TableName = keyof PublicSchema["Tables"];
export type Row<T extends TableName> = PublicSchema["Tables"][T]["Row"];
export type Insert<T extends TableName> = PublicSchema["Tables"][T]["Insert"];
export type Update<T extends TableName> = PublicSchema["Tables"][T]["Update"];
export type DbEnum<T extends keyof PublicSchema["Enums"]> = PublicSchema["Enums"][T];

export type JobRow = Row<"jobs">;
export type ProfileRow = Row<"profiles">;
export type UserPhotoRow = Row<"user_photos">;
export type LookRow = Row<"looks">;
export type SubscriptionRow = Row<"subscriptions">;

/**
 * Tipa como JSON (columnas jsonb NOT NULL) un valor ya validado con Zod. Los tipos
 * inferidos de Zod no son asignables a `Json` aunque sean JSON puro.
 */
export function toJson(value: unknown): NonNullable<Json> {
  return value as NonNullable<Json>;
}
