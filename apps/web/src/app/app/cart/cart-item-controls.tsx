"use client";

import { useActionState } from "react";

import { CartActionStatus } from "@/components/add-to-cart";
import { FavoriteButton } from "@/components/favorite-button";
import { ProductThumb } from "@/components/product-client";
import type { SwapOption } from "@/lib/cart";

import {
  type CartActionState,
  removeFromCartAction,
  selectCartItemVariantAction,
  setCartItemPurchasedAction,
  swapCartItemAction,
} from "./actions";

const idle: CartActionState = { status: "idle" };

const pill =
  "inline-flex items-center gap-1 rounded-full glass px-3 py-1 text-xs text-ink transition-colors hover:bg-paper disabled:pointer-events-none disabled:opacity-60";

/** Solo errores y avisos: la fila ya muestra el resultado (talle, comprado, producto nuevo). */
function Problems({ state }: { state: CartActionState }) {
  if (state.status === "done" && state.notices.length === 0) return null;
  return <CartActionStatus state={state} link={false} />;
}

function SizeSelect({
  itemId,
  title,
  variantId,
  variants,
}: {
  itemId: string;
  title: string;
  variantId: string | null;
  variants: Array<{ id: string; size: string; color: string | null; availability: string }>;
}) {
  const [state, action, pending] = useActionState(selectCartItemVariantAction, idle);
  return (
    <form action={action} className="flex flex-col">
      <input type="hidden" name="itemId" value={itemId} />
      <label className="inline-flex items-center gap-1.5 rounded-full glass py-0.5 pr-1 pl-3 text-xs">
        <span className="text-stone">Talle</span>
        <select
          name="variantId"
          aria-label={`Talle de ${title}`}
          defaultValue={variantId ?? ""}
          disabled={pending}
          aria-busy={pending}
          onChange={(event) => event.currentTarget.form?.requestSubmit()}
          className="rounded-full bg-transparent py-0.5 pr-1 font-medium text-ink outline-offset-2"
        >
          <option value="">Elegir</option>
          {variants.map((v) => (
            <option key={v.id} value={v.id}>
              {v.size}
              {v.color ? ` · ${v.color}` : ""}
              {v.availability === "OUT_OF_STOCK" ? " · agotado" : ""}
            </option>
          ))}
        </select>
      </label>
      <button type="submit" className="sr-only">
        Cambiar talle
      </button>
      <Problems state={state} />
    </form>
  );
}

function PurchasedToggle({ itemId, purchased }: { itemId: string; purchased: boolean }) {
  const [state, action, pending] = useActionState(setCartItemPurchasedAction, idle);
  return (
    <form action={action} className="flex flex-col">
      <input type="hidden" name="itemId" value={itemId} />
      <input type="hidden" name="purchased" value={purchased ? "false" : "true"} />
      <button type="submit" disabled={pending} aria-pressed={purchased} className={pill}>
        {purchased ? "Comprado ✓ · deshacer" : "Ya lo compré"}
      </button>
      <Problems state={state} />
    </form>
  );
}

function RemoveButton({ itemId, title }: { itemId: string; title: string }) {
  const [state, action, pending] = useActionState(removeFromCartAction, idle);
  return (
    <form action={action} className="flex flex-col">
      <input type="hidden" name="itemId" value={itemId} />
      <button
        type="submit"
        disabled={pending}
        aria-label={`Quitar ${title} del carrito`}
        className={`${pill} text-clay-dark`}
      >
        {pending ? "Quitando…" : "Quitar"}
      </button>
      <Problems state={state} />
    </form>
  );
}

function SwapChoice({ itemId, option, hex }: { itemId: string; option: SwapOption; hex: string }) {
  const [state, action, pending] = useActionState(swapCartItemAction, idle);
  return (
    <li className="grid grid-cols-[2.75rem_minmax(0,1fr)_auto] items-center gap-3 rounded-[16px] bg-ivory/60 p-2">
      <ProductThumb src={option.imageUrl} hex={hex} size="md" />
      <div className="min-w-0">
        <p className="line-clamp-2 text-[0.8125rem] leading-snug">{option.title}</p>
        <p className="text-[0.6875rem] text-stone">{option.storeName}</p>
        <Problems state={state} />
      </div>
      <form action={action} className="flex flex-col items-end gap-1.5">
        <input type="hidden" name="itemId" value={itemId} />
        <input type="hidden" name="productId" value={option.productId} />
        <p className="font-display text-base whitespace-nowrap">{option.price}</p>
        <button type="submit" disabled={pending} aria-busy={pending} className={pill}>
          {pending ? "Verificando…" : "Elegir esta"}
        </button>
      </form>
    </li>
  );
}

/**
 * Acciones de un ítem del carrito (paso 10b): talle, comprado, guardar, quitar y cambiar por
 * otra opción de la misma prenda del look. Cada una es una server action con Premium.
 */
export function CartItemControls({
  itemId,
  productId,
  title,
  variantId,
  variants,
  purchased,
  saved,
  alternatives,
  hex,
}: {
  itemId: string;
  productId: string;
  title: string;
  variantId: string | null;
  variants: Array<{ id: string; size: string; color: string | null; availability: string }>;
  purchased: boolean;
  saved: boolean;
  alternatives: SwapOption[];
  hex: string;
}) {
  return (
    <div className="mt-2">
      <div className="flex flex-wrap items-start gap-2">
        {variants.length > 0 && !purchased ? (
          // Remonta con el talle nuevo: React reinicia el formulario después de la action.
          <SizeSelect
            key={variantId ?? "none"}
            itemId={itemId}
            title={title}
            variantId={variantId}
            variants={variants}
          />
        ) : null}
        <PurchasedToggle itemId={itemId} purchased={purchased} />
        <FavoriteButton productId={productId} saved={saved} name={title} />
        <RemoveButton itemId={itemId} title={title} />
      </div>
      {alternatives.length > 0 && !purchased ? (
        <details className="group mt-2">
          <summary className="flex cursor-pointer list-none items-center gap-2 rounded-xl px-1.5 py-1 text-xs text-bark hover:text-ink [&::-webkit-details-marker]:hidden">
            <span aria-hidden="true" className="transition-transform group-open:rotate-90">
              ›
            </span>
            Cambiar por otra opción ({alternatives.length})
          </summary>
          <ul className="mt-1.5 flex flex-col gap-1.5">
            {alternatives.map((option) => (
              <SwapChoice key={option.productId} itemId={itemId} option={option} hex={hex} />
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
