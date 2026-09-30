"use client";

import type { ClientAnalyticsEvent } from "@asesor/shared";
import { useEffect } from "react";

const ANON_KEY = "ae_anon_id";

function anonymousId(): string | null {
  try {
    let id = localStorage.getItem(ANON_KEY);
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem(ANON_KEY, id);
    }
    return id;
  } catch {
    return null;
  }
}

/** Envía un evento permitido al endpoint /api/analytics. Nunca bloquea ni falla la UI. */
export function sendClientEvent(
  name: ClientAnalyticsEvent["name"],
  properties: ClientAnalyticsEvent["properties"] = {},
) {
  const body: ClientAnalyticsEvent = {
    name,
    anonymous_id: anonymousId(),
    path: location.pathname,
    properties,
  };
  void fetch("/api/analytics", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => undefined);
}

/** Emite un evento al montar el componente (p. ej., landing_view). */
export function TrackEvent({ name }: { name: ClientAnalyticsEvent["name"] }) {
  useEffect(() => {
    sendClientEvent(name);
  }, [name]);
  return null;
}
