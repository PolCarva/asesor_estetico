"use client";

import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/states";

export default function AppError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <ErrorState
      title="Algo salió mal"
      description="No pudimos cargar esta sección. Probá de nuevo en unos segundos."
      action={
        <Button variant="secondary" onClick={reset}>
          Reintentar
        </Button>
      }
    />
  );
}
