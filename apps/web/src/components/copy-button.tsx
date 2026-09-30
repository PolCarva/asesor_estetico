"use client";

import { useState } from "react";

import { Button } from "./ui/button";

/** Copia un texto al portapapeles (p. ej., las indicaciones para el peluquero). */
export function CopyButton({ text, label = "Copiar" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="secondary"
      size="sm"
      onClick={() => {
        void navigator.clipboard
          .writeText(text)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          })
          .catch(() => undefined);
      }}
    >
      <span aria-live="polite">{copied ? "Copiado" : label}</span>
    </Button>
  );
}
