import type { Metadata } from "next";
import Link from "next/link";

import { signOutAction } from "@/app/(auth)/actions";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { requireUser } from "@/lib/auth";
import { getActiveStyleProfile, getPlan, getProfile } from "@/lib/data";
import { createServerSupabaseClient } from "@asesor/db/server";

export const metadata: Metadata = { title: "Inicio" };

export default async function DashboardPage() {
  const user = await requireUser("/app/dashboard");
  const supabase = await createServerSupabaseClient();
  const [profile, plan, styleProfile, photos] = await Promise.all([
    getProfile(user.id),
    getPlan(user.id),
    getActiveStyleProfile(user.id),
    supabase.from("user_photos").select("type"),
  ]);
  const photoCount = photos.data?.length ?? 0;

  const steps = [
    {
      label: "Subir tus fotos",
      done: photoCount >= 2,
      href: "/app/onboarding/photos",
      detail: `${photoCount} de 2 fotos`,
    },
    {
      label: "Análisis de estilo",
      done: Boolean(styleProfile),
      href: "/app/onboarding",
      detail: styleProfile ? "Listo" : "Pendiente",
    },
    {
      label: "Ver tus looks",
      done: Boolean(styleProfile),
      href: "/app/looks",
      detail: styleProfile ? "3 propuestas" : "Después del análisis",
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow={plan.isPremium ? "Plan Premium" : "Plan gratuito"}
        title={`Hola${profile?.display_name ? `, ${profile.display_name}` : ""}`}
        description="Este es tu espacio. Desde acá seguís tu análisis, tus looks y tus compras."
      />

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card>
          <h2 className="text-2xl">Tu recorrido</h2>
          <ol className="mt-6 space-y-3">
            {steps.map((step, i) => (
              <li key={step.label}>
                <Link
                  href={step.href}
                  className="flex items-center gap-4 rounded-2xl border border-line p-4 transition-colors hover:border-ink"
                >
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-full text-sm ${step.done ? "bg-moss text-ivory" : "bg-sand text-ink"}`}
                    aria-hidden="true"
                  >
                    {step.done ? "✓" : i + 1}
                  </span>
                  <span className="flex-1">
                    <span className="block font-medium">{step.label}</span>
                    <span className="text-sm text-stone">{step.detail}</span>
                  </span>
                  <span className="sr-only">{step.done ? "Completado" : "Pendiente"}</span>
                </Link>
              </li>
            ))}
          </ol>
        </Card>

        <Card className="flex flex-col justify-between gap-6">
          <div>
            <p className="eyebrow">Sesión</p>
            <dl className="mt-4 space-y-3 text-sm">
              <div>
                <dt className="text-stone">Email</dt>
                <dd className="font-medium break-all">{user.email}</dd>
              </div>
              <div>
                <dt className="text-stone">Plan</dt>
                <dd className="font-medium">{plan.isPremium ? "Premium" : "Gratuito"}</dd>
              </div>
            </dl>
          </div>
          <div className="flex flex-wrap gap-3">
            <LinkButton href="/app/onboarding/photos" variant="primary">
              Mis fotos
            </LinkButton>
            <form action={signOutAction}>
              <button
                type="submit"
                className="h-11 px-4 text-sm text-stone underline underline-offset-4 hover:text-ink"
              >
                Cerrar sesión
              </button>
            </form>
          </div>
        </Card>
      </div>
    </>
  );
}
