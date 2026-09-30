"use client";

import { useEffect } from "react";

/** Registra el service worker solo en producción (en dev interferiría con HMR). */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    // NODE_ENV es una constante de build que Next.js reemplaza; no es configuración de runtime.
    // eslint-disable-next-line no-restricted-properties
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {
      // Sin service worker la app funciona igual (solo sin página offline).
    });
  }, []);
  return null;
}
