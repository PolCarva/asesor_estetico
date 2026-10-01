"use client";

import { type ReactNode, useEffect, useState } from "react";

import { Pebble } from "./swatches";
import { sendClientEvent } from "./track-event";

/** Qué identifica un producto mostrado en un look, para los eventos. */
export interface ProductRef {
  productId: string;
  storeDomain: string;
  lookId: string;
  slot: string;
  rank: number;
}

const THUMB = { md: "size-11 rounded-[12px]", lg: "size-[3.75rem] rounded-[14px]" } as const;

/**
 * Foto del producto, de la tienda (CSP `img-src https:`, D16): sin referrer y diferida. Si no
 * hay foto o no carga, el color de la prenda como guijarro.
 */
export function ProductThumb({
  src,
  hex,
  size = "lg",
}: {
  src: string | null;
  hex: string;
  size?: keyof typeof THUMB;
}) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return (
      <span className={`grid shrink-0 place-items-center bg-sand/80 ${THUMB[size]}`}>
        <Pebble hex={hex} size={size === "lg" ? "lg" : "md"} />
      </span>
    );
  }
  return (
    <span className={`relative shrink-0 overflow-hidden bg-paper ${THUMB[size]}`}>
      {/* <img>: foto de una tienda externa, fuera del optimizador de Next. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="absolute inset-0 size-full object-cover"
      />
    </span>
  );
}

/**
 * Link a la página real del producto, a través de `/api/products/[id]/open` (revalida si
 * el dato es viejo). Emite `external_product_clicked`.
 */
export function StoreLink({
  product,
  className,
  children,
}: {
  product: ProductRef;
  className: string;
  children: ReactNode;
}) {
  return (
    <a
      href={`/api/products/${product.productId}/open`}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={className}
      onClick={() =>
        sendClientEvent("external_product_clicked", {
          product_id: product.productId,
          store_domain: product.storeDomain,
          look_id: product.lookId,
          slot: product.slot,
          rank: product.rank,
        })
      }
    >
      {children}
      <span className="sr-only"> (se abre la tienda en otra pestaña)</span>
    </a>
  );
}

const SEEN_KEY = "ae_products_seen";

/** `product_viewed` una sola vez por producto y sesión del navegador (sin inundar). */
export function TrackProductView({ product }: { product: ProductRef }) {
  const { productId, storeDomain, lookId, slot, rank } = product;
  useEffect(() => {
    try {
      const seen = new Set<string>(JSON.parse(sessionStorage.getItem(SEEN_KEY) ?? "[]"));
      if (seen.has(productId)) return;
      seen.add(productId);
      sessionStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-200)));
    } catch {
      // Sin sessionStorage (modo privado estricto): se emite igual.
    }
    sendClientEvent("product_viewed", {
      product_id: productId,
      store_domain: storeDomain,
      look_id: lookId,
      slot,
      rank,
    });
  }, [productId, storeDomain, lookId, slot, rank]);
  return null;
}

/**
 * "Ver N opciones más" dentro de la fila de una prenda. Las alternativas cuentan como vistas
 * recién cuando se abren.
 */
export function AlternativesDisclosure({
  count,
  products,
  children,
}: {
  count: number;
  products: ProductRef[];
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <details className="group mt-2" onToggle={(event) => setOpen(event.currentTarget.open)}>
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-1.5 py-1 text-xs text-bark hover:text-ink [&::-webkit-details-marker]:hidden">
        <span aria-hidden="true" className="transition-transform group-open:rotate-90">
          ›
        </span>
        {open ? "Ocultar opciones" : `Ver ${count} ${count === 1 ? "opción" : "opciones"} más`}
      </summary>
      {open ? products.map((p) => <TrackProductView key={p.productId} product={p} />) : null}
      {children}
    </details>
  );
}
