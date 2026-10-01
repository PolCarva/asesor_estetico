"use client";

import { SIZE_KINDS, type UserSizes } from "@asesor/shared";
import { useActionState } from "react";

import { SizeFields } from "@/components/size-fields";
import { FormMessage } from "@/components/ui/states";
import { SubmitButton } from "@/components/ui/submit-button";

import { saveSizesAction, type SizesActionState } from "./actions";

const initial: SizesActionState = { error: null };

/** Edición de los talles del perfil: los mismos que se piden antes de buscar un look. */
export function SizesForm({ sizes }: { sizes: UserSizes }) {
  const [state, action] = useActionState(saveSizesAction, initial);
  return (
    <details className="group mt-6 rounded-[22px] well">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
        Editar mis talles
        <span aria-hidden="true" className="text-stone transition-transform group-open:rotate-45">
          +
        </span>
      </summary>
      <form action={action} className="flex flex-col gap-3 px-3 pb-3">
        {/* `key`: con talles nuevos guardados, los campos arrancan de nuevo desde ellos. */}
        <SizeFields
          key={SIZE_KINDS.map((kind) => sizes[kind]).join("|") + sizes.shoe_size_system}
          kinds={SIZE_KINDS}
          sizes={sizes}
          required={false}
        />
        {state.error ? <FormMessage>{state.error}</FormMessage> : null}
        {state.ok ? <FormMessage tone="info">Talles guardados.</FormMessage> : null}
        <SubmitButton pendingLabel="Guardando…" size="sm" className="self-start">
          Guardar talles
        </SubmitButton>
      </form>
    </details>
  );
}
