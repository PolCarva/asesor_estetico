import type { Metadata } from "next";

import { AutoRefresh } from "@/components/auto-refresh";
import { LockedLookCard, LookCard } from "@/components/look-card";
import { PaywallCard } from "@/components/paywall-card";
import { LinkButton } from "@/components/ui/button";
import { StyleAdvice } from "@/components/style-advice";
import { PageHeader } from "@/components/ui/page-header";
import { FormMessage } from "@/components/ui/states";
import { requireUser } from "@/lib/auth";
import { getAdviceView, getLooks, getPlan } from "@/lib/data";
import { FIXTURE_LOOK_SPECS } from "@asesor/shared/fixtures";

export const metadata: Metadata = { title: "Tus looks" };

export default async function LooksPage() {
  const user = await requireUser("/app/looks");
  const [looks, plan, advice] = await Promise.all([
    getLooks(user.id),
    getPlan(user.id),
    getAdviceView(user.id),
  ]);
  const hasLocked = looks.some((look) => look.locked);
  // Mientras haya imágenes de looks desbloqueados en camino, se refresca solo.
  const generating = looks.some(
    (look) => !look.locked && (look.status === "PENDING" || look.status === "GENERATING"),
  );

  return (
    <>
      <AutoRefresh active={generating} />
      <PageHeader
        eyebrow="Tus looks"
        title="Tres versiones de vos"
        description="Cada look parte de tu perfil de estilo: colores, calce y detalles pensados para potenciar lo que ya tenés."
      />

      {looks.length === 0 ? (
        <>
          <FormMessage tone="info">
            Todavía no tenés looks. Así se van a ver cuando termine tu análisis (ejemplos
            ilustrativos).
          </FormMessage>
          <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {FIXTURE_LOOK_SPECS.map((look, i) => (
              <LookCard key={look.id} look={look} position={i + 1} example />
            ))}
          </div>
          <div className="mt-10">
            <LinkButton href="/app/onboarding">Empezar mi análisis</LinkButton>
          </div>
        </>
      ) : (
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {looks.map((look) =>
            look.locked ? (
              <LockedLookCard
                key={look.id}
                name={look.name}
                position={look.position}
                href={`/app/looks/${look.id}`}
              />
            ) : (
              <LookCard
                key={look.id}
                look={look.spec}
                position={look.position}
                imageUrl={look.imageUrl}
                status={look.status}
                href={`/app/looks/${look.id}`}
              />
            ),
          )}
        </div>
      )}

      {advice ? <StyleAdvice view={advice} /> : null}

      {!plan.isPremium && (hasLocked || looks.length === 0 || advice) ? (
        <div id="premium" className="mt-14 max-w-md scroll-mt-24">
          <PaywallCard />
        </div>
      ) : null}
    </>
  );
}
