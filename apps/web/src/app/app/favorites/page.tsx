import type { Metadata } from "next";
import Link from "next/link";

import { AddToCartButton } from "@/components/add-to-cart";
import { FavoriteButton } from "@/components/favorite-button";
import { LookCard } from "@/components/look-card";
import { ProductThumb, StoreLink } from "@/components/product-client";
import { LinkButton } from "@/components/ui/button";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { requireUser } from "@/lib/auth";
import { getFavoritesPage, type SavedProductView } from "@/lib/cart";
import { getLooks, getPlan } from "@/lib/data";
import { STOCK, timeAgo, type Tone } from "@/lib/look-results";

export const metadata: Metadata = { title: "Guardados" };

const TONE: Record<Tone, string> = { ok: "text-moss", warn: "text-clay-dark", muted: "text-stone" };
const NEUTRAL_HEX = "#dcd4c4";

/** Un producto guardado: como una fila de pieza, con la tienda, el look y el carrito. */
function SavedProduct({
  product,
  isPremium,
  now,
}: {
  product: SavedProductView;
  isPremium: boolean;
  now: Date;
}) {
  const stock = STOCK[product.availability];
  return (
    <li className="rounded-[20px] glass p-2.5">
      <div className="grid grid-cols-[3.75rem_minmax(0,1fr)] items-center gap-x-3.5 gap-y-2 sm:grid-cols-[3.75rem_minmax(0,1fr)_auto]">
        <ProductThumb src={product.imageUrl} hex={NEUTRAL_HEX} />
        <div className="min-w-0">
          <p className="line-clamp-2 text-sm leading-snug font-medium">{product.title}</p>
          <p className="text-xs text-stone">{product.storeName}</p>
          <p className="mt-1 flex flex-wrap gap-x-2 font-mono text-[0.625rem] tracking-[0.04em] uppercase">
            <span className={TONE[stock.tone]}>{stock.label}</span>
            <span className="text-stone">verificado {timeAgo(product.fetchedAt, now)}</span>
          </p>
          {product.look ? (
            <Link
              href={`/app/looks/${product.look.id}`}
              className="mt-1 inline-block text-xs text-bark underline underline-offset-4 hover:text-ink"
            >
              Ver en el look{product.look.name ? ` ${product.look.name}` : ""}
            </Link>
          ) : null}
        </div>
        <div className="col-span-2 flex items-center justify-between gap-3 pl-[4.625rem] sm:col-span-1 sm:flex-col sm:items-end sm:pl-0">
          <p className="font-display text-xl leading-none whitespace-nowrap">
            {product.price ?? <span className="text-sm text-stone">Precio a consultar</span>}
          </p>
          <StoreLink
            product={{
              productId: product.productId,
              storeDomain: product.storeDomain,
              lookId: product.look?.id ?? null,
              slot: product.look?.slot ?? null,
              rank: null,
            }}
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-ink px-3.5 py-1.5 text-xs font-medium text-paper transition-[filter] hover:brightness-125"
          >
            {product.availability === "IN_STORE_ONLY" ? "Ver local ↗" : "Comprar ↗"}
          </StoreLink>
        </div>
      </div>
      {isPremium ? (
        <div className="mt-2 flex flex-wrap items-start gap-2 sm:pl-[4.625rem]">
          {product.price ? (
            <AddToCartButton
              productId={product.productId}
              lookId={product.look?.id ?? null}
              slot={product.look?.slot ?? null}
              inCart={product.inCart}
            />
          ) : null}
          <FavoriteButton productId={product.productId} saved name={product.title} />
        </div>
      ) : null}
    </li>
  );
}

export default async function FavoritesPage() {
  const user = await requireUser("/app/favorites");
  const [plan, saved, looks] = await Promise.all([
    getPlan(user.id),
    getFavoritesPage(),
    getLooks(user.id),
  ]);
  const savedLooks = saved.lookIds.flatMap((id) => {
    const look = looks.find((l) => l.id === id);
    return look && !look.locked ? [look] : [];
  });
  const empty = savedLooks.length === 0 && saved.products.length === 0;
  const now = new Date();

  return (
    <>
      <PageHeader
        eyebrow="Guardados"
        title={
          <>
            Lo que <em>guardaste.</em>
          </>
        }
        description="Los looks y productos que guardaste con ♡ para volver a verlos."
      />
      {empty ? (
        <EmptyState
          title="Nada guardado todavía"
          description="Tocá ♡ en un look o en un producto para guardarlo acá."
          action={
            <LinkButton href="/app/looks" variant="secondary">
              Ver mis looks
            </LinkButton>
          }
        />
      ) : null}

      {savedLooks.length ? (
        <section aria-labelledby="saved-looks">
          <h2 id="saved-looks" className="eyebrow">
            Looks · {savedLooks.length}
          </h2>
          <ul className="mt-4 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {savedLooks.map((look) => (
              <li key={look.id} className="mx-auto w-full max-w-[22rem]">
                <LookCard
                  look={look.spec}
                  position={look.position}
                  imageUrl={look.imageUrl}
                  status={look.status}
                  href={`/app/looks/${look.id}`}
                  action={
                    <FavoriteButton lookId={look.id} saved name={`el look ${look.spec.name}`} />
                  }
                />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {saved.products.length ? (
        <section aria-labelledby="saved-products" className={savedLooks.length ? "mt-12" : ""}>
          <h2 id="saved-products" className="eyebrow">
            Productos · {saved.products.length}
          </h2>
          {!plan.isPremium ? (
            <p className="mt-2 text-[0.8125rem] text-bark">
              Guardar y comprar productos es Premium: los tuyos quedan acá para abrir la tienda.
            </p>
          ) : null}
          <ul className="mt-4 flex max-w-3xl flex-col gap-2">
            {saved.products.map((product) => (
              <SavedProduct
                key={product.productId}
                product={product}
                isPremium={plan.isPremium}
                now={now}
              />
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}
