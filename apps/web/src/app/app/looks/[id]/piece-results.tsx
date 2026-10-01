import type { Garment } from "@asesor/shared";

import {
  AlternativesDisclosure,
  ProductThumb,
  type ProductRef,
  StoreLink,
  TrackProductView,
} from "@/components/product-client";
import { Pebble } from "@/components/swatches";
import { CATEGORY_LABEL } from "@/lib/labels";
import type {
  LookResultsView,
  PieceResultsView,
  ProductOptionView,
  Tone,
} from "@/lib/look-results";

const TONE: Record<Tone, string> = {
  ok: "text-moss",
  warn: "text-clay-dark",
  muted: "text-stone",
};

function garmentDetails(garment: Garment): string {
  return [CATEGORY_LABEL[garment.category], garment.color.name, garment.fit, garment.material]
    .filter(Boolean)
    .join(" · ");
}

/** Fila de vidrio de una pieza sin búsqueda (todavía). El lado derecho es para el producto. */
export function PieceRow({ garment }: { garment: Garment }) {
  return (
    <li className="grid grid-cols-[3.75rem_minmax(0,1fr)] items-center gap-3.5 rounded-[20px] glass p-2.5">
      <span className="grid size-[3.75rem] place-items-center rounded-[14px] bg-sand/80">
        <Pebble hex={garment.color.hex} size="lg" />
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium">{garment.description}</p>
        <p className="mt-0.5 text-xs text-stone">{garmentDetails(garment)}</p>
      </div>
    </li>
  );
}

/** "Talle M ✓ · En stock · hace 2 h", con el color de cada estado y el texto para lectores. */
function Facts({ option }: { option: ProductOptionView }) {
  const facts = [
    ...(option.size ? [{ text: option.size.label, tone: option.size.tone }] : []),
    { text: option.stock.label, tone: option.stock.tone },
    {
      text: `verificado ${option.verified}`,
      tone: option.stale ? ("warn" as const) : ("muted" as const),
    },
  ];
  return (
    <p className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[0.625rem] tracking-[0.04em] uppercase">
      {facts.map((fact) => (
        <span key={fact.text} className={TONE[fact.tone]}>
          {fact.text}
        </span>
      ))}
    </p>
  );
}

/** Local físico: dónde y cómo consultar, solo con lo que publica la tienda. */
function InStore({ option }: { option: ProductOptionView }) {
  const store = option.inStore;
  if (!store || option.availability !== "IN_STORE_ONLY") return null;
  const place = [store.address, store.locality].filter(Boolean).join(", ");
  return (
    <div className="mt-2 rounded-[14px] bg-sand/60 px-3 py-2 text-xs text-bark">
      <p className="font-medium text-ink">Disponible en tienda física</p>
      {place ? <p className="mt-0.5">{place}</p> : null}
      {store.phone ? <p className="mt-0.5">Tel. {store.phone}</p> : null}
      {store.contact_url ? (
        <a
          href={store.contact_url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          className="mt-0.5 inline-block underline underline-offset-4 hover:text-ink"
        >
          Consultar en el local<span className="sr-only"> (se abre en otra pestaña)</span>
        </a>
      ) : null}
    </div>
  );
}

const chip =
  "inline-flex shrink-0 items-center gap-1 rounded-full bg-ink px-3.5 py-1.5 text-xs font-medium text-paper transition-[filter] hover:brightness-125";

function ref(option: ProductOptionView, lookId: string, slot: string): ProductRef {
  return {
    productId: option.productId,
    storeDomain: option.storeDomain,
    lookId,
    slot,
    rank: option.rank,
  };
}

/** Una alternativa compacta (dentro de "Ver N opciones más"). */
function Alternative({
  option,
  garment,
  lookId,
  slot,
}: {
  option: ProductOptionView;
  garment: Garment;
  lookId: string;
  slot: string;
}) {
  return (
    <li className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-3 rounded-[16px] bg-ivory/60 p-2">
      <ProductThumb src={option.imageUrl} hex={garment.color.hex} size="md" />
      <div className="min-w-0">
        <p className="line-clamp-2 text-[0.8125rem] leading-snug">{option.title}</p>
        <p className="text-[0.6875rem] text-stone">{option.storeName}</p>
        <Facts option={option} />
        <InStore option={option} />
      </div>
      <div className="flex flex-col items-end gap-1.5">
        <p className="font-display text-base whitespace-nowrap">
          {option.price ?? <span className="text-xs text-stone">A consultar</span>}
        </p>
        <StoreLink product={ref(option, lookId, slot)} className={chip}>
          Ver ↗
        </StoreLink>
      </div>
    </li>
  );
}

/**
 * Fila de una prenda con sus resultados (diseño 2h): el RECOMENDADO a la vista (foto, nombre,
 * tienda, talle, stock, precio y "Comprar ↗") y las alternativas dentro de la misma fila.
 * Sin opciones, lo dice.
 */
export function PieceResultsRow({ piece, lookId }: { piece: PieceResultsView; lookId: string }) {
  const { garment, recommended, alternatives, slot } = piece;
  if (!recommended) {
    return (
      <li className="grid grid-cols-[3.75rem_minmax(0,1fr)] items-center gap-3.5 rounded-[20px] glass p-2.5">
        <span className="grid size-[3.75rem] place-items-center rounded-[14px] bg-sand/80">
          <Pebble hex={garment.color.hex} size="lg" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-medium">{garment.description}</p>
          <p className="mt-0.5 text-xs text-stone">{garmentDetails(garment)}</p>
          <p className="mt-1 text-xs text-clay-dark">
            {piece.status === "failed"
              ? "No pudimos revisar las tiendas para esta prenda. Probá buscar de nuevo."
              : "No encontramos opciones para esta prenda todavía."}
          </p>
        </div>
      </li>
    );
  }

  const isStore = recommended.availability === "IN_STORE_ONLY";
  return (
    <li className="rounded-[20px] glass p-2.5">
      <TrackProductView product={ref(recommended, lookId, slot)} />
      <div className="grid grid-cols-[3.75rem_minmax(0,1fr)] items-center gap-x-3.5 gap-y-2 sm:grid-cols-[3.75rem_minmax(0,1fr)_auto]">
        <ProductThumb src={recommended.imageUrl} hex={garment.color.hex} />
        <div className="min-w-0">
          <p className="font-mono text-[0.625rem] tracking-[0.08em] text-moss uppercase">
            Recomendado · {garment.description}
          </p>
          <p className="mt-0.5 line-clamp-2 text-sm leading-snug font-medium">
            {recommended.title}
          </p>
          <p className="text-xs text-stone">{recommended.storeName}</p>
          <Facts option={recommended} />
        </div>
        <div className="col-span-2 flex items-center justify-between gap-3 pl-[4.625rem] sm:col-span-1 sm:flex-col sm:items-end sm:pl-0">
          <p className="font-display text-xl leading-none whitespace-nowrap">
            {recommended.price ?? <span className="text-sm text-stone">Precio a consultar</span>}
          </p>
          <StoreLink product={ref(recommended, lookId, slot)} className={chip}>
            {isStore ? "Ver local ↗" : "Comprar ↗"}
          </StoreLink>
        </div>
      </div>
      <div className="sm:pl-[4.625rem]">
        <InStore option={recommended} />
        {/* Paso 09: "Buscar más barato" · Paso 10b: "Agregar al carrito". */}
        {alternatives.length ? (
          <AlternativesDisclosure
            count={alternatives.length}
            products={alternatives.map((option) => ref(option, lookId, slot))}
          >
            <ul className="mt-1.5 flex flex-col gap-1.5">
              {alternatives.map((option) => (
                <Alternative
                  key={option.productId}
                  option={option}
                  garment={garment}
                  lookId={lookId}
                  slot={slot}
                />
              ))}
            </ul>
          </AlternativesDisclosure>
        ) : null}
      </div>
    </li>
  );
}

/** Total de los recomendados por moneda (nunca convertido) y cuándo se verificaron. */
export function LookTotals({ view }: { view: LookResultsView }) {
  if (view.withResults === 0) return null;
  const pieces = view.pieces.length;
  return (
    <div className="mt-3 rounded-[20px] glass px-4 py-3 text-[0.8125rem]">
      {view.totals.length === 0 ? (
        <p className="text-bark">Los precios de estas opciones se consultan en cada tienda.</p>
      ) : view.complete && view.totals[0] ? (
        <p className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-bark">
            {view.withResults === pieces
              ? "Look completo, con los recomendados"
              : `Recomendados de ${view.withResults} de ${pieces} prendas`}
          </span>
          <span className="font-display text-xl">{view.totals[0].amount}</span>
        </p>
      ) : view.totals.length === 1 && view.totals[0] ? (
        <p className="flex flex-wrap items-baseline justify-between gap-x-3">
          <span className="text-bark">
            Recomendados con precio ({view.totals[0].count} de {view.withResults}); el resto se
            consulta en la tienda
          </span>
          <span className="font-display text-xl">{view.totals[0].amount}</span>
        </p>
      ) : (
        <p className="text-bark">
          Recomendados:{" "}
          {view.totals.map((total, i) => (
            <span key={total.amount}>
              {i > 0 ? " + " : ""}
              <span className="font-medium text-ink">{total.amount}</span> ({total.count}{" "}
              {total.count === 1 ? "prenda" : "prendas"})
            </span>
          ))}
          . Cada moneda por separado, sin convertir.
        </p>
      )}
      <p className="mt-1 text-xs text-stone">
        Precios de las tiendas, verificados {view.oldestVerified}.{" "}
        {view.stale
          ? "Algunos tienen más de 8 horas: al abrir la tienda los volvemos a revisar."
          : "La compra se hace en cada tienda."}
      </p>
      {view.sizesChanged ? (
        <p className="mt-1 text-xs text-clay-dark">
          Cambiaste tus talles después de esta búsqueda: el talle de cada opción es el que usaste al
          buscar. Buscá de nuevo para ver los actuales.
        </p>
      ) : null}
    </div>
  );
}
