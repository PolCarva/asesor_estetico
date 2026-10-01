"use client";

import { useState } from "react";

/**
 * Imagen privada con URL firmada en una pantalla que se refresca sola (AutoRefresh).
 * Cada refresco firma una URL nueva; esta imagen se queda con la primera que recibe,
 * así no se vuelve a descargar ni parpadea. Usa <img> y no next/image: las fotos
 * privadas no deben pasar por el cache del optimizador.
 */
export function PrivateImage({
  src,
  alt,
  className = "",
}: {
  src: string | null;
  alt: string;
  className?: string;
}) {
  const [stable, setStable] = useState(src);
  // Patrón de React para derivar estado de props: si todavía no había URL, se toma la nueva.
  if (stable === null && src !== null) setStable(src);
  if (!stable) return null;
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={stable} alt={alt} className={className} />;
}
