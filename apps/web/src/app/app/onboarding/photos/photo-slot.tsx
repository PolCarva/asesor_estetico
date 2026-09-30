"use client";

import { ALLOWED_PHOTO_MIME_TYPES, MAX_PHOTO_BYTES, type UserPhotoType } from "@asesor/shared";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import { buttonClass } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/states";
import { downscaleImage } from "@/lib/downscale-image";
import { SubmitButton } from "@/components/ui/submit-button";

import { deletePhotoAction, type PhotoActionState, uploadPhotoAction } from "./actions";

export interface PhotoSlotProps {
  type: UserPhotoType;
  title: string;
  description: string;
  photo: {
    id: string;
    url: string | null;
    status: "UPLOADED" | "VALIDATING" | "VALID" | "INVALID";
    issues: string[];
  } | null;
}

const STATUS_LABEL = {
  UPLOADED: { text: "Lista para analizar", tone: "bg-sand text-ink" },
  VALIDATING: { text: "Revisando…", tone: "bg-sand text-ink" },
  VALID: { text: "Foto válida", tone: "bg-moss text-ivory" },
  INVALID: { text: "Conviene cambiarla", tone: "bg-danger text-ivory" },
} as const;

const initial: PhotoActionState = { error: null };

function checkFile(file: File): string | null {
  if (!(ALLOWED_PHOTO_MIME_TYPES as readonly string[]).includes(file.type))
    return "Usá una foto JPG, PNG o WEBP.";
  if (file.size > MAX_PHOTO_BYTES) return "La foto supera los 10 MB.";
  return null;
}

/**
 * Subir, previsualizar, reemplazar y eliminar una foto. La validación del cliente
 * es solo para UX: el servidor vuelve a validar tipo real, tamaño y propiedad.
 */
export function PhotoSlot({ type, title, description, photo }: PhotoSlotProps) {
  const inputId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [uploadState, uploadAction] = useActionState(
    async (prev: PhotoActionState, formData: FormData) => {
      const file = formData.get("file");
      if (file instanceof File && file.size > 0) formData.set("file", await downscaleImage(file));
      const result = await uploadPhotoAction(prev, formData);
      // Después de subir con éxito, se muestra la foto guardada (URL firmada).
      if (result.ok) {
        setPreview(null);
        formRef.current?.reset();
      }
      return result;
    },
    initial,
  );
  const [deleteState, deleteAction] = useActionState(deletePhotoAction, initial);

  // Libera la URL local de la previsualización.
  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview);
    },
    [preview],
  );

  const onChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setClientError(null);
    if (!file) return setPreview(null);
    const error = checkFile(file);
    if (error) {
      setClientError(error);
      event.target.value = "";
      return setPreview(null);
    }
    setPreview(URL.createObjectURL(file));
  };

  const shown = preview ?? photo?.url ?? null;
  const error = clientError ?? uploadState.error ?? deleteState.error;

  return (
    <section
      aria-labelledby={`${inputId}-title`}
      className="rounded-3xl border border-line bg-paper p-5"
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-sand">
        {shown ? (
          // <img> y no next/image: las fotos son privadas y no deben pasar por el cache de optimización.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt={`Tu foto: ${title}`} className="size-full object-cover" />
        ) : (
          <div className="flex size-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-stone">
            <span
              className="size-14 rounded-full border border-dashed border-stone/40"
              aria-hidden="true"
            />
            Todavía no subiste esta foto
          </div>
        )}
        {preview ? (
          <span className="absolute top-3 left-3 rounded-full bg-ink px-3 py-1 text-xs text-ivory">
            Vista previa
          </span>
        ) : photo ? (
          <span
            className={`absolute top-3 left-3 rounded-full px-3 py-1 text-xs ${STATUS_LABEL[photo.status].tone}`}
          >
            {STATUS_LABEL[photo.status].text}
          </span>
        ) : null}
      </div>

      <h2 id={`${inputId}-title`} className="mt-5 text-2xl">
        {title}
      </h2>
      <p className="mt-1 text-sm leading-relaxed text-stone">{description}</p>

      {error ? (
        <div className="mt-4">
          <FormMessage>{error}</FormMessage>
        </div>
      ) : null}
      {!preview && photo?.status === "INVALID" && photo.issues.length > 0 ? (
        <div className="mt-4">
          <FormMessage>{photo.issues.join(" ")}</FormMessage>
        </div>
      ) : null}
      {uploadState.ok && !preview ? (
        <div className="mt-4">
          <FormMessage tone="info">Foto guardada.</FormMessage>
        </div>
      ) : null}

      <form ref={formRef} action={uploadAction} className="mt-5 flex flex-wrap gap-3">
        <input type="hidden" name="type" value={type} />
        <label
          htmlFor={inputId}
          className={buttonClass(preview ? "ghost" : "secondary", "md", "cursor-pointer")}
        >
          {photo ? "Reemplazar" : "Elegir foto"}
        </label>
        <input
          ref={inputRef}
          id={inputId}
          name="file"
          type="file"
          accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
          className="sr-only"
          onChange={onChange}
        />
        {preview ? <SubmitButton pendingLabel="Subiendo…">Guardar foto</SubmitButton> : null}
      </form>

      {photo && !preview ? (
        <form action={deleteAction} className="mt-3">
          <input type="hidden" name="photo_id" value={photo.id} />
          <SubmitButton variant="ghost" pendingLabel="Eliminando…" className="px-0 text-danger">
            Eliminar foto
          </SubmitButton>
        </form>
      ) : null}
    </section>
  );
}
