import { LinkButton } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main
      id="contenido"
      className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 text-center"
    >
      <p className="eyebrow">Error 404</p>
      <h1 className="mt-4 text-4xl">No encontramos esta página</h1>
      <p className="mt-3 text-stone">Puede que el enlace esté mal o que ya no exista.</p>
      <div className="mt-8">
        <LinkButton href="/" variant="secondary">
          Volver al inicio
        </LinkButton>
      </div>
    </main>
  );
}
