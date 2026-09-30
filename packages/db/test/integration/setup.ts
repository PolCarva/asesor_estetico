import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { createClient } from "@supabase/supabase-js";
import { describe } from "vitest";

import { createAdminClient } from "../../src/clients/admin";
import type { TypedSupabaseClient } from "../../src/types";

const envFile = resolve(import.meta.dirname, "../../../../.env");
if (existsSync(envFile)) process.loadEnvFile(envFile);

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function reachable() {
  if (!url || !anonKey || !serviceRoleKey) return false;
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: anonKey },
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const available = await reachable();
if (!available) {
  const message =
    "[integration] Supabase local no disponible: corré `pnpm db:start` y `pnpm env:local`.";
  // En CI la falta de Supabase es un error, no un skip silencioso.
  if (process.env.CI) throw new Error(message);
  console.warn(`${message} Se saltean los tests de integración.`);
}

export const describeIntegration = available ? describe : describe.skip;

export function adminClient(): TypedSupabaseClient {
  return createAdminClient({ url: url!, serviceRoleKey: serviceRoleKey! });
}

/** Crea un usuario de prueba y devuelve un cliente autenticado como él (anon key + sesión). */
export async function createTestUser(label: string) {
  const admin = adminClient();
  const email = `test-${label}-${crypto.randomUUID().slice(0, 8)}@example.test`;
  const password = `pw-${crypto.randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: `Test ${label}`, age_confirmed: true },
  });
  if (error || !data.user) throw error ?? new Error("no user");
  const client = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  }) as TypedSupabaseClient;
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { id: data.user.id, email, client };
}

export async function deleteTestUser(id: string) {
  await adminClient().auth.admin.deleteUser(id);
}
