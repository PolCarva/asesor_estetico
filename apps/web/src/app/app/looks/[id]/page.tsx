import {
  type Garment,
  type GarmentSlot,
  listLookGarments,
  type ProductCategory,
} from "@asesor/shared";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { AutoRefresh } from "@/components/auto-refresh";
import { LockedLookCard, LookCard } from "@/components/look-card";
import { PaywallCard } from "@/components/paywall-card";
import { TrackEvent } from "@/components/track-event";
import { requireUser } from "@/lib/auth";
import { getLook, getPlan } from "@/lib/data";

export const metadata: Metadata = { title: "Look" };

const CATEGORY: Record<ProductCategory, string> = {
  SHIRT: "Camisa",
  T_SHIRT: "Remera",
  KNITWEAR: "Tejido",
  TOP: "Top",
  OUTERWEAR: "Abrigo",
  BLAZER: "Blazer",
  PANTS: "Pantalón",
  JEANS: "Jean",
  SHORTS: "Short",
  SKIRT: "Pollera",
  DRESS: "Vestido",
  SHOES: "Calzado",
  BAG: "Bolso",
  BELT: "Cinto",
  JEWELRY: "Joyería",
  EYEWEAR: "Anteojos",
  WATCH: "Reloj",
  HAT: "Gorro",
  SCARF: "Bufanda",
  OTHER: "Accesorio",
};

function slotLabel(slot: GarmentSlot): string {
  if (slot === "top") return "Arriba";
  if (slot === "bottom") return "Abajo";
  if (slot === "shoes") return "Calzado";
  return slot.startsWith("layering") ? "Capa" : "Accesorio";
}

function GarmentRow({ slot, garment }: { slot: GarmentSlot; garment: Garment }) {
  const details = [garment.fit, garment.material, garment.pattern].filter(Boolean);
  return (
    <li className="flex gap-4 border-b border-line py-4 last:border-b-0">
      <span
        className="mt-1 size-8 shrink-0 rounded-full border border-ink/10"
        style={{ backgroundColor: garment.color.hex }}
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="eyebrow">
          {slotLabel(slot)} · {CATEGORY[garment.category]}
        </p>
        <p className="mt-1 text-sm font-medium">{garment.description}</p>
        <p className="mt-1 text-xs text-stone">{[garment.color.name, ...details].join(" · ")}</p>
      </div>
    </li>
  );
}

function Bullets({ items, tone }: { items: string[]; tone: "do" | "avoid" }) {
  return (
    <ul className="mt-3 space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-sm leading-snug">
          <span aria-hidden="true" className={tone === "do" ? "text-moss" : "text-danger"}>
            {tone === "do" ? "✓" : "×"}
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function LookDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/app/looks/${id}`);
  const [look, plan] = await Promise.all([getLook(user.id, id), getPlan(user.id)]);
  if (!look) notFound();

  const back = (
    <Link href="/app/looks" className="text-sm text-stone hover:text-ink">
      ← Tus looks
    </Link>
  );

  if (look.locked) {
    return (
      <>
        <TrackEvent name="locked_look_clicked" properties={{ position: look.position }} />
        {back}
        <div className="mt-6 grid gap-10 md:grid-cols-2">
          <LockedLookCard name={look.name} position={look.position} />
          <div id="premium">
            <PaywallCard />
          </div>
        </div>
      </>
    );
  }

  const { spec } = look;
  const generating = look.status === "PENDING" || look.status === "GENERATING";
  return (
    <>
      <AutoRefresh active={generating} />
      <TrackEvent
        name={plan.isPremium ? "premium_look_viewed" : "free_look_viewed"}
        properties={{ position: look.position }}
      />
      {back}
      <div className="mt-6 grid gap-10 md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        <div>
          <LookCard
            look={spec}
            position={look.position}
            imageUrl={look.imageUrl}
            status={look.status}
          />
          {/* Paso 07: CTA "Encontrar este look" (shopping). */}
        </div>

        <div className="space-y-10">
          <section aria-labelledby="look-garments">
            <h2 id="look-garments" className="text-3xl">
              Prendas
            </h2>
            <p className="mt-2 text-sm text-stone">Fit general: {spec.fit.overall}</p>
            <ul className="mt-4">
              {listLookGarments(spec).map(({ slot, garment }) => (
                <GarmentRow key={slot} slot={slot} garment={garment} />
              ))}
            </ul>
            {spec.fit.notes.length ? <Bullets items={spec.fit.notes} tone="do" /> : null}
          </section>

          <section aria-labelledby="look-hair" className="grid gap-6 sm:grid-cols-2">
            <h2 id="look-hair" className="sr-only">
              Pelo y grooming
            </h2>
            <div className="rounded-3xl border border-line bg-paper p-6">
              <p className="eyebrow">Pelo</p>
              <p className="mt-2 text-sm font-medium">{spec.hair.style}</p>
              {spec.hair.notes ? (
                <p className="mt-1 text-sm text-stone">{spec.hair.notes}</p>
              ) : null}
            </div>
            <div className="rounded-3xl border border-line bg-paper p-6">
              <p className="eyebrow">Grooming</p>
              <p className="mt-2 text-sm">{spec.grooming.description}</p>
            </div>
          </section>

          <section aria-labelledby="look-why" className="grid gap-6 sm:grid-cols-2">
            <div>
              <h2 id="look-why" className="text-2xl">
                Por qué te queda
              </h2>
              <Bullets items={spec.reasoning} tone="do" />
            </div>
            {spec.avoid.length ? (
              <div>
                <h2 className="text-2xl">Con este look, evitá</h2>
                <Bullets items={spec.avoid} tone="avoid" />
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </>
  );
}
