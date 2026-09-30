"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Refresca los datos del servidor cada `intervalMs` mientras `active` sea true (p. ej., jobs en curso). */
export function AutoRefresh({
  active,
  intervalMs = 4000,
}: {
  active: boolean;
  intervalMs?: number;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [active, intervalMs, router]);
  return null;
}
