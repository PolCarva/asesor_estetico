"use client";

import { type ShoeSizeSystem, SIZE_OPTIONS, type SizeKind, type UserSizes } from "@asesor/shared";
import { useEffect, useRef, useState } from "react";

import { SIZE_KIND_LABEL } from "@/lib/labels";

const HINT: Record<SizeKind, string> = {
  top: "El que usás en remeras y camisas.",
  bottom: "El número de la etiqueta: cintura (28–36) o talle (38–50).",
  shoe: "EU y US no son lo mismo: elegí el sistema de tu número.",
};

function Pill({
  name,
  value,
  defaultChecked,
  required,
}: {
  name: string;
  value: string;
  defaultChecked: boolean;
  required: boolean;
}) {
  return (
    <label className="flex min-w-12 cursor-pointer items-center justify-center rounded-full border border-line/80 bg-ivory/60 px-3.5 py-2 text-sm transition-colors has-[:checked]:border-ink has-[:checked]:bg-ink has-[:checked]:text-paper has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-moss">
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        required={required}
        className="sr-only"
      />
      {value}
    </label>
  );
}

/**
 * Talles a elegir, en filas de vidrio con opciones en píldoras. Solo los tipos que se
 * pasan (el detalle del look pide solo los que faltan). Los nombres de los campos son los
 * de `SizesFormSchema`.
 */
export function SizeFields({
  kinds,
  sizes,
  required = true,
}: {
  kinds: readonly SizeKind[];
  sizes: UserSizes;
  required?: boolean;
}) {
  const [system, setSystem] = useState<ShoeSizeSystem>(sizes.shoe_size_system);
  const root = useRef<HTMLDivElement>(null);
  // React reinicia el formulario después de una action (`form.reset()`): los radios vuelven a
  // su valor por defecto y la lista de números tiene que seguir al sistema que quedó marcado.
  // El evento llega antes del reinicio, así que se lee después.
  useEffect(() => {
    const form = root.current?.closest("form");
    if (!form) return;
    const onReset = () =>
      setTimeout(() => {
        const checked = form.querySelector<HTMLInputElement>(
          'input[name="shoe_size_system"]:checked',
        );
        if (checked?.value === "EU" || checked?.value === "US") setSystem(checked.value);
      });
    form.addEventListener("reset", onReset);
    return () => form.removeEventListener("reset", onReset);
  }, []);
  return (
    <div ref={root} className="flex flex-col gap-2.5">
      {kinds.map((kind) => {
        const options = kind === "shoe" ? SIZE_OPTIONS.shoe[system] : SIZE_OPTIONS[kind];
        const current = kind === "shoe" && system !== sizes.shoe_size_system ? null : sizes[kind];
        return (
          <fieldset key={kind} className="rounded-[20px] glass p-4">
            <legend className="sr-only">{SIZE_KIND_LABEL[kind]}</legend>
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p aria-hidden="true" className="text-sm font-medium">
                {SIZE_KIND_LABEL[kind]}
              </p>
              <p className="text-xs text-stone">{HINT[kind]}</p>
            </div>
            {kind === "shoe" ? (
              <div
                role="radiogroup"
                aria-label="Sistema de talles de calzado"
                className="mt-3 inline-flex gap-1 rounded-full well p-1"
              >
                {(["EU", "US"] as const).map((option) => (
                  <label
                    key={option}
                    className="cursor-pointer rounded-full px-3.5 py-1 font-mono text-xs has-[:checked]:bg-cream has-[:checked]:shadow-[0_2px_6px_rgb(48_44_30/0.15)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-moss"
                  >
                    <input
                      type="radio"
                      name="shoe_size_system"
                      value={option}
                      defaultChecked={sizes.shoe_size_system === option}
                      onChange={() => setSystem(option)}
                      className="sr-only"
                    />
                    {option}
                  </label>
                ))}
              </div>
            ) : null}
            {/* `key`: al cambiar de sistema, el número elegido no sirve y se reinicia. */}
            <div key={kind === "shoe" ? system : kind} className="mt-3 flex flex-wrap gap-1.5">
              {options.map((option) => (
                <Pill
                  key={option}
                  name={kind}
                  value={option}
                  defaultChecked={current === option}
                  required={required}
                />
              ))}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
