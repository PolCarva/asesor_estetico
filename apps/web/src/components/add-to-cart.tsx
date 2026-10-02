"use client";

import Link from "next/link";
import { useActionState } from "react";

import { addLookToCartAction, addToCartAction, type CartActionState } from "@/app/app/cart/actions";

import { buttonClass } from "./ui/button";

const idle: CartActionState = { status: "idle" };

/** Resultado de una acción del carrito: confirmación con link, avisos honestos o el error. */
export function CartActionStatus({
  state,
  link = true,
}: {
  state: CartActionState;
  link?: boolean;
}) {
  if (state.status === "idle") return null;
  if (state.status === "paywall") {
    return (
      <p role="alert" className="mt-1.5 text-xs text-clay-dark">
        El carrito es Premium.
      </p>
    );
  }
  if (state.status === "error") {
    return (
      <p role="alert" className="mt-1.5 text-xs text-clay-dark">
        {state.error}
      </p>
    );
  }
  return (
    <div role="status" className="mt-1.5 text-xs">
      <p className="text-moss">
        {state.message}
        {link ? (
          <>
            {" "}
            <Link href="/app/cart" className="text-ink underline underline-offset-4">
              Ver carrito
            </Link>
          </>
        ) : null}
      </p>
      {state.notices.map((notice) => (
        <p key={notice} className="mt-0.5 text-clay-dark">
          {notice}
        </p>
      ))}
    </div>
  );
}

const pill =
  "inline-flex items-center gap-1 rounded-full glass px-3 py-1 text-xs text-ink transition-colors hover:bg-paper disabled:pointer-events-none disabled:opacity-60";

/**
 * "Agregar al carrito" de un producto de los resultados (paso 10b). El talle lo elige el
 * servidor según el perfil; si el dato tiene más de 8 h, espera la revalidación (hasta 8 s).
 */
export function AddToCartButton({
  productId,
  lookId = null,
  slot = null,
  inCart,
}: {
  productId: string;
  /** Look y prenda del resultado; sin ellos, el producto entra suelto (desde guardados). */
  lookId?: string | null;
  slot?: string | null;
  inCart: boolean;
}) {
  const [state, action, pending] = useActionState(addToCartAction, idle);
  return (
    <form action={action} className="flex flex-col items-start">
      <input type="hidden" name="productId" value={productId} />
      {lookId && slot ? (
        <>
          <input type="hidden" name="lookId" value={lookId} />
          <input type="hidden" name="slot" value={slot} />
        </>
      ) : null}
      {inCart && !pending ? (
        <Link href="/app/cart" className={`${pill} text-moss`}>
          En el carrito ✓
        </Link>
      ) : (
        <button type="submit" disabled={pending} aria-busy={pending} className={pill}>
          {pending ? "Verificando precio y stock…" : "+ Agregar al carrito"}
        </button>
      )}
      <CartActionStatus state={state} link={!inCart} />
    </form>
  );
}

/**
 * "Agregar el look al carrito · $ total" (diseño 2h): el recomendado de cada prenda. Si ya
 * está todo, lleva al carrito.
 */
export function AddLookToCartButton({
  lookId,
  total,
  inCart,
}: {
  lookId: string;
  /** "$ 7.258" si el total es de una sola moneda; si no, sin monto. */
  total: string | null;
  inCart: boolean;
}) {
  const [state, action, pending] = useActionState(addLookToCartAction, idle);
  return (
    <form action={action} className="min-w-0 flex-1">
      <input type="hidden" name="lookId" value={lookId} />
      {inCart && !pending ? (
        <Link href="/app/cart" className={buttonClass("primary", "lg-wrap", "w-full")}>
          El look está en tu carrito · Ver carrito
        </Link>
      ) : (
        <button
          type="submit"
          disabled={pending}
          aria-busy={pending}
          className={buttonClass("primary", "lg-wrap", "w-full")}
        >
          {pending
            ? "Verificando precios y stock…"
            : `Agregar el look al carrito${total ? ` · ${total}` : ""}`}
        </button>
      )}
      <CartActionStatus state={state} link={!inCart} />
    </form>
  );
}
