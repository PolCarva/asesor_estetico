"use client";

import { ALLOWED_PHOTO_MIME_TYPES, MAX_PHOTO_BYTES, type UserPhotoType } from "@asesor/shared";
import { useActionState, useEffect, useId, useRef, useState } from "react";

import { buttonClass } from "@/components/ui/button";
import { FormMessage } from "@/components/ui/states";
import { SubmitButton } from "@/components/ui/submit-button";
import { downscaleImage } from "@/lib/downscale-image";

import { deletePhotoAction, type PhotoActionState, uploadPhotoAction } from "./actions";

export interface PhotoSlotProps {
  type: UserPhotoType;
  title: string;
  description: string;
  /** Letra del hueco en el diseño ("A — Cuerpo completo"). */
  letter: string;
  /** Proporción sugerida, como en el diseño ("3:4"). */
  ratio: "3:4" | "4:5";
  photo: {
    id: string;
    url: string | null;
    status: "UPLOADED" | "VALIDATING" | "VALID" | "INVALID";
    issues: string[];
  } | null;
}

const STATUS_LABEL = {
  UPLOADED: { text: "Lista para analizar", tone: "glass-strong text-ink" },
  VALIDATING: { text: "Revisando…", tone: "glass-strong text-ink" },
  VALID: { text: "✓ Foto válida", tone: "bg-moss text-paper" },
  INVALID: { text: "Conviene cambiarla", tone: "bg-danger text-paper" },
} as const;

const initial: PhotoActionState = { error: null };

function checkFile(file: File): string | null {
  if (!(ALLOWED_PHOTO_MIME_TYPES as readonly string[]).includes(file.type))
    return "Usá una foto JPG, PNG o WEBP.";
  if (file.size > MAX_PHOTO_BYTES) return "La foto supera los 10 MB.";
  return null;
}

/** Guías de encuadre en línea punteada: silueta para el cuerpo, óvalos para el rostro. */
function FrameGuides({ ratio }: { ratio: PhotoSlotProps["ratio"] }) {
  const dashed = "absolute left-1/2 -translate-x-1/2 border-[1.5px] border-dashed border-moss/45";
  if (ratio === "3:4") {
    return (
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        <div
          className={`${dashed} top-[7%] bottom-[7%] w-[38%] rounded-t-[80px] rounded-b-[40px]`}
        />
        <div className={`${dashed} top-[7%] aspect-[70/86] w-[18%] rounded-[50%]`} />
      </div>
    );
  }
  const ring = "absolute top-1/2 left-1/2 -translate-1/2 rounded-[50%]";
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0">
      <div className={`${ring} aspect-[250/314] w-[78%] border border-moss/10`} />
      <div className={`${ring} aspect-[210/270] w-[66%] border border-moss/20`} />
      <div
        className={`${ring} aspect-[170/226] w-[53%] border-[1.5px] border-dashed border-moss/45`}
      />
    </div>
  );
}

/**
 * Subir, previsualizar, reemplazar y eliminar una foto. Se puede arrastrar al hueco o
 * elegir el archivo. La validación del cliente es solo para UX: el servidor vuelve a
 * validar tipo real, tamaño y propiedad.
 */
export function PhotoSlot({ type, title, description, letter, ratio, photo }: PhotoSlotProps) {
  const inputId = useId();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
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

  const pick = (file: File | undefined, input: HTMLInputElement) => {
    setClientError(null);
    if (!file) return setPreview(null);
    const error = checkFile(file);
    if (error) {
      setClientError(error);
      input.value = "";
      return setPreview(null);
    }
    setPreview(URL.createObjectURL(file));
  };

  const onDrop = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    const input = inputRef.current;
    if (!input || !event.dataTransfer.files.length) return;
    input.files = event.dataTransfer.files;
    pick(input.files[0], input);
  };

  const shown = preview ?? photo?.url ?? null;
  const error = clientError ?? uploadState.error ?? deleteState.error;
  const titleId = `${inputId}-title`;

  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={titleId} className="eyebrow">
          <span aria-hidden="true">{letter} — </span>
          {title}
        </h2>
        <span aria-hidden="true" className="eyebrow">
          {ratio}
        </span>
      </div>

      <form ref={formRef} action={uploadAction} className="flex flex-col gap-3">
        <input type="hidden" name="type" value={type} />
        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          className={`relative grid place-items-center overflow-hidden rounded-[28px] well has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-moss ${ratio === "3:4" ? "aspect-[3/4]" : "aspect-[4/5]"} ${dragging ? "ring-2 ring-moss/50" : ""}`}
        >
          {shown ? (
            // <img> y no next/image: las fotos son privadas y no deben pasar por el cache de optimización.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={shown}
              alt={`Tu foto: ${title}`}
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            <FrameGuides ratio={ratio} />
          )}

          {preview ? (
            <span className="absolute top-3 left-3 rounded-full bg-ink px-3 py-1.5 font-mono text-[0.6875rem] tracking-[0.06em] text-paper uppercase">
              Vista previa
            </span>
          ) : photo ? (
            <span
              className={`absolute top-3 left-3 rounded-full px-3 py-1.5 font-mono text-[0.6875rem] tracking-[0.06em] uppercase ${STATUS_LABEL[photo.status].tone}`}
            >
              {STATUS_LABEL[photo.status].text}
            </span>
          ) : null}

          <label
            htmlFor={inputId}
            className={
              shown
                ? "sr-only"
                : "relative flex cursor-pointer flex-col items-center gap-2.5 rounded-[20px] glass-strong px-5 py-4 text-center shadow-[0_18px_36px_-18px_rgb(48_44_30/0.4)]"
            }
          >
            <span
              aria-hidden="true"
              className="grid size-11 place-items-center rounded-full raised-dark text-lg"
            >
              ↑
            </span>
            <span className="text-sm font-medium">
              <span className="hidden sm:inline">Arrastrá tu foto</span>
              <span className="sm:hidden">Subí tu foto</span>
            </span>
            <span className="text-xs text-stone">
              o <span className="text-moss underline underline-offset-2">elegí un archivo</span>
            </span>
          </label>
          <input
            ref={inputRef}
            id={inputId}
            name="file"
            type="file"
            accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={(event) => pick(event.target.files?.[0], event.target)}
          />
        </div>

        {!shown ? <p className="text-xs text-stone">Todavía no subiste esta foto</p> : null}
        <p className="text-xs leading-relaxed text-stone">{description}</p>

        {error ? <FormMessage>{error}</FormMessage> : null}
        {!preview && photo?.status === "INVALID" && photo.issues.length > 0 ? (
          <FormMessage>{photo.issues.join(" ")}</FormMessage>
        ) : null}
        {uploadState.ok && !preview ? <FormMessage tone="info">Foto guardada.</FormMessage> : null}

        {shown ? (
          <div className="flex flex-wrap items-center gap-2.5">
            {preview ? (
              <SubmitButton pendingLabel="Subiendo…" size="sm">
                Guardar foto
              </SubmitButton>
            ) : null}
            <label
              htmlFor={inputId}
              className={buttonClass(preview ? "ghost" : "secondary", "sm", "cursor-pointer")}
            >
              {preview ? "Elegir otra" : "Reemplazar"}
            </label>
          </div>
        ) : null}
      </form>

      {photo && !preview ? (
        <form action={deleteAction}>
          <input type="hidden" name="photo_id" value={photo.id} />
          <SubmitButton
            variant="ghost"
            size="sm"
            pendingLabel="Eliminando…"
            className="px-0! text-danger! hover:bg-transparent"
          >
            Eliminar foto
          </SubmitButton>
        </form>
      ) : null}
    </section>
  );
}
