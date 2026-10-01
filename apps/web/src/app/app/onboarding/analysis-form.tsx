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
    <label
      className={`flex cursor-pointer gap-3 ${hint ? "rounded-2xl p-3.5" : "items-center rounded-full px-4 py-2.5 text-sm"} border border-line/80 bg-ivory/60 transition-colors has-[:checked]:border-ink has-[:checked]:bg-cream has-[:checked]:shadow-[0_10px_24px_-18px_rgb(48_44_30/0.45)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-moss`}
    >
      <input
        type="radio"
        name={name}
        value={value}
        defaultChecked={defaultChecked}
        className={hint ? "mt-1 accent-ink" : "accent-ink"}
        required
      />
      <span>
        <span className="block font-medium">{label}</span>
        {hint ? <span className="text-[0.8125rem] leading-snug text-stone">{hint}</span> : null}
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
    <form action={action} className="space-y-7">
      <fieldset>
        <legend className="eyebrow">¿Cuánto querés cambiar?</legend>
        <div className="mt-3 grid gap-2">
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
        <legend className="eyebrow">Si tenés tatuajes, en tus looks preferís…</legend>
        <div className="mt-3 flex flex-wrap gap-2">
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
      <div className="flex flex-col gap-2.5">
        {canSubmit ? (
          <SubmitButton pendingLabel="Iniciando…" size="lg" className="w-full">
            {submitLabel}
          </SubmitButton>
        ) : (
          <button
            type="button"
            disabled
            className="h-14 w-full rounded-full bg-line text-[0.9375rem] font-medium text-stone"
          >
            {submitLabel}
          </button>
        )}
        <p className="text-center font-mono text-[0.6875rem] tracking-[0.06em] text-stone uppercase">
          ≈ 1–2 minutos · Podés salir de esta pantalla
        </p>
      </div>
    </form>
  );
}
