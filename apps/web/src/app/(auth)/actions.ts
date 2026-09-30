"use server";

import { createServerSupabaseClient } from "@asesor/db/server";
import { isAppError } from "@asesor/shared";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { getAnalytics } from "@/lib/analytics";
import { clientIp } from "@/lib/api";
import { getLogger } from "@/lib/logger";
import { enforceRateLimit, rateLimiters } from "@/lib/rate-limit";
import { safeNextPath } from "@/lib/safe-redirect";

export type AuthFormState = { error: string | null; info?: string | null };

const PasswordSchema = z
  .string()
  .min(8, "La contraseña debe tener al menos 8 caracteres.")
  .max(72, "La contraseña es demasiado larga.")
  .regex(/[A-Za-z]/, "La contraseña debe incluir letras.")
  .regex(/\d/, "La contraseña debe incluir números.");

const SignUpSchema = z.object({
  display_name: z.string().trim().min(1, "Contanos cómo te llamás.").max(80),
  email: z.email("Ingresá un email válido.").max(254),
  password: PasswordSchema,
  age_confirmed: z.literal("on", { error: "El servicio es solo para mayores de 18 años." }),
});

const SignInSchema = z.object({
  email: z.email("Ingresá un email válido.").max(254),
  password: z.string().min(1, "Ingresá tu contraseña.").max(72),
  next: z.string().optional(),
});

async function limitByIp() {
  try {
    await enforceRateLimit(rateLimiters.auth, `auth:${clientIp(await headers())}`);
    return null;
  } catch (error) {
    return isAppError(error) ? error.message : "Error inesperado.";
  }
}

export async function signUpAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const limited = await limitByIp();
  if (limited) return { error: limited };

  const parsed = SignUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { data: { display_name: parsed.data.display_name, age_confirmed: true } },
  });
  if (error) {
    getLogger().warn("signup fallido", { code: error.code, status: error.status });
    return {
      error:
        error.code === "user_already_exists"
          ? "Ya existe una cuenta con ese email."
          : "No pudimos crear la cuenta.",
    };
  }

  if (!data.session) {
    // Confirmación por email activada: la sesión llega después de /auth/confirm.
    return { error: null, info: "Te enviamos un email para confirmar tu cuenta." };
  }

  await getAnalytics().trackEvent("signup_completed", {
    userId: data.user?.id ?? null,
    path: "/signup",
  });
  redirect("/app/onboarding");
}

export async function signInAction(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const limited = await limitByIp();
  if (limited) return { error: limited };

  const parsed = SignInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });
  // Mensaje genérico: no revela si el email existe.
  if (error) return { error: "Email o contraseña incorrectos." };

  redirect(safeNextPath(parsed.data.next));
}

export async function signOutAction() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  redirect("/");
}
