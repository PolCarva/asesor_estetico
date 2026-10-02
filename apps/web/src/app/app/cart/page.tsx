import { type CartGroup, type CartLineView, type CartTotals, type Money } from "@asesor/shared";
import type { Metadata } from "next";
import Link from "next/link";

import { PaywallCard } from "@/components/paywall-card";
import { ProductThumb, StoreLink } from "@/components/product-client";
import { LinkButton } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState, FormMessage } from "@/components/ui/states";
import { requireUser } from "@/lib/auth";
import { type CartPageData, getCartPage, slotKey } from "@/lib/cart";
import { getPlan } from "@/lib/data";
import { slotLabel, twoDigits } from "@/lib/labels";
import { formatMoney, STOCK, timeAgo, type Tone } from "@/lib/look-results";

import { CartItemControls } from "./cart-item-controls";

export const metadata: Metadata = { title: "Carrito" };

const TONE: Record<Tone, string> = { ok: "text-moss", warn: "text-clay-dark", muted: "text-stone" };
/** Respaldo de la miniatura cuando no se puede leer la prenda del look. */
const NEUTRAL_HEX = "#dcd4c4";

const sum = (amounts: Money[]) => amounts.map(formatMoney).join(" + ");

/**
 * Un producto del carrito (diseño de las filas de piezas): miniatura, prenda, nombre, tienda y
 * talle, stock y verificación, precio y "Comprar ↗". Lo comprado queda tachado.
 */
function CartRow({
  line,
  data,
  readOnly,
  now,
}: {
  line: CartLineView;
  data: CartPageData;
  readOnly: boolean;
  now: Date;
}) {
  const key = slotKey(line.look?.id, line.slot);
  const garment = data.garments.get(key);
  const hex = garment?.color.hex ?? NEUTRAL_HEX;
  const stock = STOCK[line.availability];
  const image = line.imageUrl?.startsWith("https://") ? line.imageUrl : null;
  const size = line.variant?.size
    ? `Talle ${line.variant.size}${line.variant.color ? ` · ${line.variant.color}` : ""}`
    : line.variants.length > 0
      ? "Talle sin elegir"
      : null;
  return (
    <li className={`rounded-[20px] glass p-2.5 ${line.purchased ? "bg-sand/40" : ""}`}>
      <div className="grid grid-cols-[3.75rem_minmax(0,1fr)] items-center gap-x-3.5 gap-y-2 sm:grid-cols-[3.75rem_minmax(0,1fr)_auto]">
        <ProductThumb src={image} hex={hex} />
        <div className="min-w-0">
          <p className="font-mono text-[0.625rem] tracking-[0.08em] text-moss uppercase">
            {garment?.description ?? slotLabel(line.slot)}
          </p>
          <p
            className={`mt-0.5 line-clamp-2 text-sm leading-snug font-medium ${line.purchased ? "text-stone line-through decoration-stone/60" : ""}`}
          >
            {line.title}
          </p>
          <p className="text-xs text-stone">{[line.storeName, size].filter(Boolean).join(" · ")}</p>
          <p className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 font-mono text-[0.625rem] tracking-[0.04em] uppercase">
            {line.purchased ? (
              <span className="text-moss">Comprado ✓</span>
            ) : (
              <span className={TONE[stock.tone]}>{stock.label}</span>
            )}
            <span className={line.stale ? "text-clay-dark" : "text-stone"}>
              verificado {timeAgo(line.fetchedAt, now)}
            </span>
          </p>
          {line.priceChange ? (
            <p className="mt-1 text-xs text-clay-dark">
              Cambió el precio desde que lo agregaste: antes {formatMoney(line.priceChange.from)}.
            </p>
          ) : null}
        </div>
        <div className="col-span-2 flex items-center justify-between gap-3 pl-[4.625rem] sm:col-span-1 sm:flex-col sm:items-end sm:pl-0">
          <p
            className={`font-display text-xl leading-none whitespace-nowrap ${line.purchased ? "text-stone" : ""}`}
          >
            {line.lineTotal ? (
              formatMoney(line.lineTotal)
            ) : (
              <span className="text-sm text-stone">Precio a consultar</span>
            )}
          </p>
          <StoreLink
            product={{
              productId: line.productId,
              storeDomain: line.storeDomain,
              lookId: line.look?.id ?? null,
              slot: line.slot,
              rank: null,
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ink px-3.5 py-1.5 text-xs font-medium text-paper transition-[filter] hover:brightness-125"
          >
            Comprar ↗
          </StoreLink>
        </div>
      </div>
      {readOnly ? null : (
        <div className="sm:pl-[4.625rem]">
          <CartItemControls
            itemId={line.id}
            productId={line.productId}
            title={line.title}
            variantId={line.variant?.id ?? null}
            variants={line.variants}
            purchased={line.purchased}
            saved={data.savedProducts.has(line.productId)}
            alternatives={(data.alternatives.get(key) ?? []).filter(
              (o) => o.productId !== line.productId,
            )}
            hex={hex}
          />
        </div>
      )}
    </li>
  );
}

/** "TU LOOK" con su nombre, sus productos y el subtotal de lo que falta comprar. */
function Group({
  group,
  data,
  readOnly,
  now,
}: {
  group: CartGroup;
  data: CartPageData;
  readOnly: boolean;
  now: Date;
}) {
  const { look } = group;
  const id = `grupo-${group.key}`;
  return (
    <section aria-labelledby={id}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <p className="eyebrow">
            {look ? `Tu look${look.position ? ` · ${twoDigits(look.position)}` : ""}` : "Sin look"}
          </p>
          <h2 id={id} className="mt-1 text-2xl leading-tight">
            {look?.name ? (
              <Link href={`/app/looks/${look.id}`} className="hover:text-moss">
                {look.name}
              </Link>
            ) : look ? (
              "Un look Premium"
            ) : (
              "Otros productos"
            )}
          </h2>
        </div>
        {group.subtotals.length ? (
          <p className="text-sm text-bark">
            Subtotal <span className="font-display text-xl text-ink">{sum(group.subtotals)}</span>
          </p>
        ) : null}
      </div>
      <ul className="mt-3 flex flex-col gap-2">
        {group.lines.map((line) => (
          <CartRow key={line.id} line={line} data={data} readOnly={readOnly} now={now} />
        ))}
      </ul>
    </section>
  );
}

/** TOTAL APROX. por moneda (nunca sumadas entre sí), lo comprado y lo que quedó fuera. */
function Totals({ totals }: { totals: CartTotals }) {
  return (
    <div className="rounded-[24px] glass p-5 lg:sticky lg:top-24">
      <p className="eyebrow">Total aprox.</p>
      {totals.pending.length ? (
        <p className="mt-2 font-display text-[2.5rem] leading-none">{sum(totals.pending)}</p>
      ) : (
        <p className="mt-2 text-sm text-bark">No te queda nada por comprar.</p>
      )}
      {totals.approx ? (
        <p className="mt-2 text-xs text-stone">
          ≈ {formatMoney(totals.approx)} en total, con una conversión aproximada de dólares a pesos.
        </p>
      ) : null}
      <ul className="mt-4 space-y-1.5 text-[0.8125rem] text-bark">
        <li>
          {totals.pendingCount} {totals.pendingCount === 1 ? "producto" : "productos"} por comprar
        </li>
        {totals.withoutPrice ? (
          <li className="text-clay-dark">
            {totals.withoutPrice === 1
              ? "1 producto no tiene precio publicado hoy: queda fuera del total."
              : `${totals.withoutPrice} productos no tienen precio publicado hoy: quedan fuera del total.`}
          </li>
        ) : null}
        {totals.purchased.length ? (
          <li>
            Ya comprado ({totals.purchasedCount}):{" "}
            <span className="font-medium text-ink">{sum(totals.purchased)}</span>
          </li>
        ) : null}
      </ul>
      <p className="mt-4 text-xs leading-relaxed text-stone">
        La compra se hace en cada tienda. Son los precios de la última verificación: al abrir la
        tienda, si tienen más de 8 horas, los volvemos a revisar.
      </p>
    </div>
  );
}

export default async function CartPage() {
  const user = await requireUser("/app/cart");
  const [plan, data] = await Promise.all([getPlan(user.id), getCartPage()]);
  const { view } = data;
  const header = (
    <PageHeader
      eyebrow="Carrito externo"
      title={
        <>
          Tu <em>carrito.</em>
        </>
      }
      description="Tu lista de compras, agrupada por look. La compra se hace en cada tienda."
    />
  );

  if (!plan.isPremium && view.empty) {
    return (
      <>
        {header}
        <div className="max-w-md">
          <PaywallCard />
        </div>
      </>
    );
  }

  // Premium vencido (D18): el carrito queda guardado, en solo lectura.
  const readOnly = !plan.isPremium;
  const now = new Date();
  return (
    <>
      {header}
      {readOnly ? (
        <div className="mb-8 max-w-2xl">
          <FormMessage tone="info">
            Tu Premium no está activo: tu carrito queda guardado en solo lectura. Podés abrir cada
            tienda; para cambiarlo, renová Premium.
          </FormMessage>
        </div>
      ) : null}
      {view.empty ? (
        <EmptyState
          title="Tu carrito está vacío"
          description="Entrá a un look, buscá las prendas y agregá las que te gusten: acá las vas a ver juntas, con el total aproximado."
          action={
            <LinkButton href="/app/looks" variant="secondary">
              Ver mis looks
            </LinkButton>
          }
        />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_19rem] lg:gap-10">
          <div className="flex flex-col gap-10">
            {view.groups.map((group) => (
              <Group key={group.key} group={group} data={data} readOnly={readOnly} now={now} />
            ))}
          </div>
          <aside aria-label="Total">
            <Totals totals={view.totals} />
            {readOnly ? (
              <div className="mt-6">
                <PaywallCard />
              </div>
            ) : null}
          </aside>
        </div>
      )}
    </>
  );
}
