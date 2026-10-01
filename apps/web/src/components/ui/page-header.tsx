import type { ReactNode } from "react";

/**
 * Encabezado de página: etiqueta mono arriba y titular en Familjen Grotesk. El título
 * acepta nodos para resaltar una palabra en itálica (`<em>`), como en el diseño.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        {eyebrow ? <p className="mb-3 eyebrow">{eyebrow}</p> : null}
        <h1 className="text-4xl leading-none sm:text-5xl [&_em]:text-moss">{title}</h1>
        {description ? (
          <p className="mt-4 max-w-xl leading-relaxed text-bark">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex gap-3">{actions}</div> : null}
    </header>
  );
}
