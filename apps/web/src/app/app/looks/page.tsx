import type { Metadata } from "next";

import { AutoRefresh } from "@/components/auto-refresh";
import { FavoriteButton } from "@/components/favorite-button";
import { LockedLookCard, LookCard } from "@/components/look-card";
import { LookStage } from "@/components/look-stage";
import { PaywallCard } from "@/components/paywall-card";
import { StyleAdvice } from "@/components/style-advice";
import { LinkButton } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/states";
import { requireUser } from "@/lib/auth";
import { getSavedIds } from "@/lib/cart";
import { getAdviceView, getLooks, getPlan, getProfile } from "@/lib/data";
import { firstName, twoDigits } from "@/lib/labels";
import { FIXTURE_LOOK_SPECS } from "@asesor/shared/fixtures";

export const metadata: Metadata = { title: "Tus looks" };

export default async function LooksPage() {
  const user = await requireUser("/app/looks");
  const [looks, plan, profile, advice, saved] = await Promise.all([
    getLooks(user.id),
    getPlan(user.id),
    getProfile(user.id),
    getAdviceView(user.id),
    getSavedIds(),
  ]);
  const name = firstName(profile?.display_name);
  const hasLocked = looks.some((look) => look.locked);
  // Mientras haya imágenes de looks desbloqueados en camino, se refresca solo.
  const generating = looks.some(
    (look) => !look.locked && (look.status === "PENDING" || look.status === "GENERATING"),
  );
  const first = looks.find((look) => !look.locked);

  if (looks.length === 0) {
    return (
      <>
        <header className="text-center">
          <p className="eyebrow text-moss">Ejemplos ilustrativos</p>
          <h1 className="mt-3 text-[2.5rem] leading-[1.02] text-balance sm:text-5xl lg:text-[3.375rem]">
            Así se van a ver <em className="text-clay">tus looks.</em>
          </h1>
        </header>
        <div className="mx-auto mt-6 max-w-xl">
          <FormMessage tone="info">
            Todavía no tenés looks. Cuando termine tu análisis, vas a ver tres versiones de vos con
            tu propia imagen.
          </FormMessage>
        </div>
        <div className="mt-8">
          <LookStage
            label="Looks de ejemplo"
            items={FIXTURE_LOOK_SPECS.map((look, i) => (
              <LookCard key={look.id} look={look} position={i + 1} example featured={i === 0} />
            ))}
          />
        </div>
        <div className="mt-6 flex justify-center">
          <LinkButton href="/app/onboarding" size="lg">
            Empezar mi análisis
          </LinkButton>
        </div>
      </>
    );
  }

  return (
    <>
      <AutoRefresh active={generating} />
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10 bg-topo [mask-image:linear-gradient(180deg,transparent_20%,#000_70%)]"
      />
      <header className="text-center">
        <p className="eyebrow text-moss">Análisis completo</p>
        <h1 className="mt-3 text-[2.5rem] leading-[1.02] text-balance sm:text-5xl lg:text-[3.375rem]">
          {name ? `${name}, estas` : "Estas"} son tus{" "}
          <em className="text-clay">mejores versiones.</em>
        </h1>
      </header>

      <div className="mt-8 sm:mt-10">
        <LookStage
          label="Tus 3 looks"
          items={looks.map((look, i) =>
            look.locked ? (
              <LockedLookCard
                key={look.id}
                name={look.name}
                position={look.position}
                href={`/app/looks/${look.id}`}
                featured={i === 0}
              />
            ) : (
              <LookCard
                key={look.id}
                look={look.spec}
                position={look.position}
                imageUrl={look.imageUrl}
                status={look.status}
                href={`/app/looks/${look.id}`}
                featured={i === 0}
                action={
                  <FavoriteButton
                    lookId={look.id}
                    saved={saved.looks.has(look.id)}
                    name={`el look ${look.spec.name}`}
                  />
                }
              />
            ),
          )}
        />
      </div>

      <div className="mt-4 flex flex-wrap justify-center gap-3 md:mt-2">
        {first ? (
          <LinkButton href={`/app/looks/${first.id}`} size="lg">
            Ver look {twoDigits(first.position)}
          </LinkButton>
        ) : null}
        <LinkButton href="/app/profile" variant="secondary" size="lg">
          Mi análisis
        </LinkButton>
      </div>

      {advice ? <StyleAdvice view={advice} /> : null}

      {!plan.isPremium && (hasLocked || advice) ? (
        <div id="premium" className="mx-auto mt-16 max-w-md scroll-mt-24">
          <PaywallCard />
        </div>
      ) : null}
    </>
  );
}
