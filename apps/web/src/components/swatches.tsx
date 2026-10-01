import type { ColorSwatch } from "@asesor/shared";

/** Bordes orgánicos para que cada color se vea como un guijarro distinto. */
const PEBBLE_SHAPES = [
  "52% 48% 46% 54% / 58% 52% 48% 42%",
  "48% 52% 55% 45% / 50% 46% 54% 50%",
  "55% 45% 48% 52% / 46% 54% 46% 54%",
  "50% 50% 45% 55% / 55% 45% 55% 45%",
  "46% 54% 52% 48% / 52% 48% 52% 48%",
];

const SIZE = { sm: "size-5", md: "size-9", lg: "size-11" } as const;

/** Un color como guijarro con relieve (brillo arriba, sombra de contacto abajo). */
export function Pebble({
  hex,
  size = "md",
  index = 0,
  className = "",
}: {
  hex: string;
  size?: keyof typeof SIZE;
  index?: number;
  className?: string;
}) {
  return (
    <span
      aria-hidden="true"
      className={`${SIZE[size]} inline-block shrink-0 shadow-[0_8px_12px_-6px_rgb(48_44_30/0.5)] ${className}`}
      style={{
        borderRadius: PEBBLE_SHAPES[index % PEBBLE_SHAPES.length],
        background: `radial-gradient(circle at 35% 30%, rgb(255 255 255 / 0.35), transparent 50%), ${hex}`,
      }}
    />
  );
}

/** Paleta de colores como guijarros. Con `labels`, el nombre se ve debajo de cada uno. */
export function Swatches({
  colors,
  size = "md",
  labels = size !== "sm",
}: {
  colors: ColorSwatch[];
  size?: keyof typeof SIZE;
  labels?: boolean;
}) {
  return (
    <ul className="flex flex-wrap items-end gap-2.5" aria-label="Paleta de colores">
      {colors.map((color, i) => (
        <li
          key={`${color.name}-${color.hex}`}
          className={labels ? "flex w-14 flex-col items-center gap-1.5 text-center" : "flex"}
        >
          <Pebble hex={color.hex} size={size} index={i} />
          {labels ? (
            <span className="text-[0.6875rem] leading-tight text-stone">{color.name}</span>
          ) : (
            <span className="sr-only">{color.name}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * Anillo con los colores del look (en lugar del puntaje del diseño: el SPEC no admite
 * puntuaciones ni porcentajes inventados). Adentro, el número del look.
 */
export function PaletteRing({
  colors,
  label,
  size = "md",
  inner = "bg-paper",
}: {
  colors: string[];
  label: string;
  size?: "sm" | "md" | "lg";
  /** Color del centro, para que combine con el fondo. */
  inner?: string;
}) {
  const slice = 100 / Math.max(colors.length, 1);
  const stops = colors.map((hex, i) => `${hex} ${i * slice}% ${(i + 1) * slice}%`).join(", ");
  const dims = { sm: "size-11 p-1", md: "size-[3.25rem] p-[5px]", lg: "size-[3.625rem] p-[5px]" };
  return (
    <span
      aria-hidden="true"
      className={`${dims[size]} grid shrink-0 place-items-center rounded-full`}
      style={{ background: `conic-gradient(${stops || "#4e5b3c 0 100%"})` }}
    >
      <span
        className={`${inner} grid size-full place-items-center rounded-full font-mono text-xs font-medium`}
      >
        {label}
      </span>
    </span>
  );
}
