"use client";

import Link from "next/link";
import { useActionState } from "react";

import { FormMessage } from "@/components/ui/states";
import { SubmitButton } from "@/components/ui/submit-button";

import { type AuthFormState, signInAction, signUpAction } from "./actions";

const initial: AuthFormState = { error: null };

const inputClass =
  "border-line bg-paper placeholder:text-stone/60 focus:border-ink mt-2 block h-12 w-full rounded-2xl border px-4 text-base outline-none transition-colors";

function Field({
  label,
  name,
  type = "text",
  autoComplete,
  hint,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete: string;
  hint?: string;
}) {
  const hintId = hint ? `${name}-hint` : undefined;
  return (
    <div>
      <label htmlFor={name} className="text-sm font-medium">
        {label}
      </label>
      <input
        id={name}
        name={name}
        type={type}
        autoComplete={autoComplete}
        required
        aria-describedby={hintId}
        className={inputClass}
      />
      {hint ? (
        <p id={hintId} className="mt-1.5 text-xs text-stone">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function SignUpForm() {
  const [state, action] = useActionState(signUpAction, initial);
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      {state.info ? <FormMessage tone="info">{state.info}</FormMessage> : null}
      <Field label="Nombre" name="display_name" autoComplete="given-name" />
      <Field label="Email" name="email" type="email" autoComplete="email" />
      <Field
        label="Contraseña"
        name="password"
        type="password"
        autoComplete="new-password"
        hint="Mínimo 8 caracteres, con letras y números."
      />
      <label className="flex items-start gap-3 text-sm">
        <input type="checkbox" name="age_confirmed" required className="mt-0.5 size-4 accent-ink" />
        <span>Confirmo que tengo 18 años o más.</span>
      </label>
      <SubmitButton pendingLabel="Creando cuenta…" className="w-full">
        Crear cuenta
      </SubmitButton>
      <p className="text-center text-sm text-stone">
        ¿Ya tenés cuenta?{" "}
        <Link href="/login" className="text-ink underline underline-offset-4">
          Ingresá
        </Link>
      </p>
    </form>
  );
}

export function SignInForm({ next }: { next?: string }) {
  const [state, action] = useActionState(signInAction, initial);
  return (
    <form action={action} className="space-y-5" noValidate>
      {state.error ? <FormMessage>{state.error}</FormMessage> : null}
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <Field label="Email" name="email" type="email" autoComplete="email" />
      <Field label="Contraseña" name="password" type="password" autoComplete="current-password" />
      <SubmitButton pendingLabel="Ingresando…" className="w-full">
        Ingresar
      </SubmitButton>
      <p className="text-center text-sm text-stone">
        ¿No tenés cuenta?{" "}
        <Link href="/signup" className="text-ink underline underline-offset-4">
          Creá una
        </Link>
      </p>
    </form>
  );
}
