import Link from "next/link";

export function Logo({ href = "/" }: { href?: string }) {
  return (
    <Link
      href={href}
      className="font-display text-xl tracking-tight"
      aria-label="Asesor Estético, inicio"
    >
      <span className="italic">Asesor</span> <span className="text-clay">Estético</span>
    </Link>
  );
}
