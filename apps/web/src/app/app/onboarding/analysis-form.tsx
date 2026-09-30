"use client";

import type { StyleRiskLevel, TattooPreference } from "@asesor/shared";
import { useActionState } from "react";

import { FormMessage } from "@/components/ui/states";
import { SubmitButton } from "@/components/ui/submit-button";

import { type AnalysisActionState, startAnalysisAction } from "./actions";

const RISK: Array<{ value: StyleRiskLevel; label: string; hint: string }> = [
  { value: "CONSERVATIVE", label: "Clásico", hint: "Mejorar lo que ya usás, sin sorpresas." },
  {
    value: "BALANCED",
    label: "Equilibrado",
    hint: "Algunos cambios visibles, fáciles de adoptar.",
  },
  { value: "BOLD", label: "Audaz", hint: "Animarme a algo claramente distinto." },
];

const TATTOO: Array<{ value: TattooPreference; label: string }> = [
  { value: "HIGHLIGHT", label: "Mostrarlos" },
  { value: "NEUTRAL", label: "Me da igual" },
  { value: "COVER", label: "Cubrirlos" },
];

const initial: AnalysisActionState = { error: null };

function Choice({
  name,
  value,
  label,
  hint,
  defaultChecked,
}: {
  name: string;
  value: string;
  label: string;
  hint?: string;
  defaultChecked: boolean;
}) {
  return (
    <label className="flex cursor-pointer gap-3 rounded-2xl border border-line p-4 transition-colors has-[:checked]:border-ink has-[:checked]:bg-paper">
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className="mt-1 accent-ink"
        required
      />
      <span>
        <span className="block font-medium">{label}</span>
        {hint ? <span className="text-sm text-stone">{hint}</span> : null}
      </span>
    </label>
  );
}

export function AnalysisForm({
  risk,
  tattoo,
  canSubmit,
  submitLabel,
}: {
  risk: StyleRiskLevel;
  tattoo: TattooPreference;
  canSubmit: boolean;
  submitLabel: string;
}) {
  const [state, action] = useActionState(startAnalysisAction, initial);
  return (
    <form action={action} className="space-y-8">
      <fieldset>
        <legend className="text-xl">¿Cuánto querés cambiar?</legend>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {RISK.map((o) => (
            <Choice
              key={o.value}
              name="style_risk_level"
              value={o.value}
              label={o.label}
              hint={o.hint}
              defaultChecked={o.value === risk}
            />
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="text-xl">Si tenés tatuajes, en tus looks preferís…</legend>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {TATTOO.map((o) => (
            <Choice
              key={o.value}
              name="tattoo_preference"
              value={o.value}
              label={o.label}
              defaultChecked={o.value === tattoo}
            />
          ))}
        </div>
      </fieldset>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      <div className="flex flex-wrap items-center gap-4">
        {canSubmit ? (
          <SubmitButton pendingLabel="Iniciando…">{submitLabel}</SubmitButton>
        ) : (
          <button
            type="button"
            disabled
            className="h-11 rounded-full bg-ink px-6 text-sm text-ivory opacity-50"
          >
            {submitLabel}
          </button>
        )}
        <p className="text-sm text-stone">
          El análisis tarda uno o dos minutos. Podés salir de esta pantalla.
        </p>
      </div>
    </form>
  );
}
