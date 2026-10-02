"use client";

import { useActionState } from "react";

import {
  type FavoriteActionState,
  removeFavoriteAction,
  saveFavoriteAction,
} from "@/app/app/favorites/actions";

const idle: FavoriteActionState = { status: "idle" };

/** Guarda o quita según lo que muestra el botón (las dos actions verifican plan en el servidor). */
function toggle(prev: FavoriteActionState, formData: FormData) {
  return formData.get("intent") === "remove"
    ? removeFavoriteAction(prev, formData)
    : saveFavoriteAction(prev, formData);
}

const SIZES = {
  sm: { button: "size-8", icon: "size-4" },
  lg: { button: "size-14", icon: "size-6" },
} as const;

/**
 * ♡ de "Guardados" (diseño 2h): círculo de vidrio, lleno si está guardado. Looks con cualquier
 * plan; productos, Premium (el servidor lo verifica y responde `paywall`).
 */
export function FavoriteButton({
  lookId,
  productId,
  saved,
  size = "sm",
  name,
}: {
  lookId?: string;
  productId?: string;
  saved: boolean;
  size?: keyof typeof SIZES;
  /** Qué se guarda, para el lector de pantalla ("el look Smart casual"). */
  name: string;
}) {
  const [state, action, pending] = useActionState(toggle, idle);
  // Mientras responde el servidor, el corazón ya muestra el estado nuevo.
  const shown = pending ? !saved : saved;
  const message =
    state.status === "paywall"
      ? "Guardar productos es Premium."
      : state.status === "error"
        ? state.error
        : null;
  return (
    <form action={action} className="relative inline-flex shrink-0 flex-col items-center">
      {lookId ? <input type="hidden" name="lookId" value={lookId} /> : null}
      {productId ? <input type="hidden" name="productId" value={productId} /> : null}
      <input type="hidden" name="intent" value={saved ? "remove" : "save"} />
      <button
        type="submit"
        disabled={pending}
        aria-pressed={shown}
        aria-label={shown ? `Quitar ${name} de guardados` : `Guardar ${name}`}
        title={shown ? "Quitar de guardados" : "Guardar"}
        className={`grid place-items-center rounded-full glass transition-colors hover:bg-paper disabled:cursor-wait ${SIZES[size].button} ${shown ? "text-clay-dark" : "text-stone hover:text-ink"}`}
      >
        <svg
          viewBox="0 0 24 24"
          className={SIZES[size].icon}
          fill={shown ? "currentColor" : "none"}
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden="true"
        >
          <path
            d="M12 20s-7.5-4.6-7.5-10.2A4.2 4.2 0 0 1 12 7.3a4.2 4.2 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20z"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {message ? (
        <span
          role="alert"
          className="absolute top-full right-0 z-10 mt-1 w-max max-w-48 rounded-xl bg-paper px-2.5 py-1 text-[0.6875rem] text-clay-dark shadow-contact"
        >
          {message}
        </span>
      ) : null}
    </form>
  );
}
