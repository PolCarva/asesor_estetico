import type { ColorSwatch } from "@asesor/shared";

export function Swatches({ colors, size = "md" }: { colors: ColorSwatch[]; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "size-5" : "size-8";
  return (
    <ul className="flex flex-wrap gap-2" aria-label="Paleta de colores">
      {colors.map((color) => (
        <li key={`${color.name}-${color.hex}`} className="flex items-center gap-2">
          <span
            className={`${dim} inline-block rounded-full border border-ink/10`}
            style={{ backgroundColor: color.hex }}
            aria-hidden="true"
          />
          {size === "md" ? (
            <span className="text-xs text-stone">{color.name}</span>
          ) : (
            <span className="sr-only">{color.name}</span>
          )}
        </li>
      ))}
    </ul>
  );
}
