import type { Metadata } from "next";

import { signOutAction } from "@/app/(auth)/actions";
import { Swatches } from "@/components/swatches";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { SubmitButton } from "@/components/ui/submit-button";
import { requireUser } from "@/lib/auth";
import { getActiveStyleProfile, getPlan, getProfile } from "@/lib/data";

export const metadata: Metadata = { title: "Perfil" };

const RISK = { CONSERVATIVE: "Clásico", BALANCED: "Equilibrado", BOLD: "Audaz" } as const;
const TATTOO = { HIGHLIGHT: "Mostrarlos", NEUTRAL: "Indistinto", COVER: "Cubrirlos" } as const;

export default async function ProfilePage() {
  const user = await requireUser("/app/profile");
  const [profile, plan, style] = await Promise.all([
    getProfile(user.id),
    getPlan(user.id),
    getActiveStyleProfile(user.id),
  ]);

  return (
    <>
      <PageHeader eyebrow="Tu cuenta" title="Perfil" />
      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <Card>
          <h2 className="text-2xl">Datos</h2>
          <dl className="mt-5 space-y-4 text-sm">
            {[
              ["Nombre", profile?.display_name ?? "—"],
              ["Email", user.email ?? "—"],
              ["País", profile?.country_code ?? "UY"],
              ["Plan", plan.isPremium ? "Premium" : "Gratuito"],
              ["Nivel de riesgo", profile ? RISK[profile.style_risk_level] : "—"],
              ["Tatuajes", profile ? TATTOO[profile.tattoo_preference] : "—"],
            ].map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 border-b border-line pb-3">
                <dt className="text-stone">{label}</dt>
                <dd className="text-right font-medium break-all">{value}</dd>
              </div>
            ))}
          </dl>
          <form action={signOutAction} className="mt-6">
            <SubmitButton variant="secondary" pendingLabel="Saliendo…">
              Cerrar sesión
            </SubmitButton>
          </form>
        </Card>

        {style ? (
          <Card>
            <p className="eyebrow">Tu perfil de estilo</p>
            <h2 className="mt-2 text-3xl">{style.style_direction.primary}</h2>
            <div className="mt-6 space-y-6">
              <section>
                <h3 className="font-sans text-sm font-medium">Tus mejores colores</h3>
                <div className="mt-3">
                  <Swatches colors={style.colors.best} />
                </div>
              </section>
              <section>
                <h3 className="font-sans text-sm font-medium">Fortalezas</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-stone">
                  {style.strengths.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </section>
              <section>
                <h3 className="font-sans text-sm font-medium">Mejor evitar</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-stone">
                  {style.avoid.map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </section>
            </div>
          </Card>
        ) : (
          <EmptyState
            title="Sin perfil de estilo"
            description="Tu perfil aparece acá cuando termine el análisis de tus fotos."
          />
        )}
      </div>
      <p className="mt-10 max-w-xl text-xs leading-relaxed text-stone">
        Tus fotos se guardan en almacenamiento privado, solo vos podés verlas y podés borrarlas en
        cualquier momento desde “Tus fotos”. No se usan para entrenar modelos.
      </p>
    </>
  );
}
