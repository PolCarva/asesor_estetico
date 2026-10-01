import Link from "next/link";

import { APP_NAME } from "@asesor/shared";

/** Marca: orbe (el estilista) + nombre en Familjen Grotesk itálica. */
export function Logo({ href = "/", tone = "ink" }: { href?: string; tone?: "ink" | "bone" }) {
  return (
    <Link
      href={href}
      className={`flex items-center gap-2.5 font-display text-[1.375rem] font-medium tracking-tight italic sm:text-[1.625rem] ${tone === "bone" ? "text-bone" : "text-ink"}`}
      aria-label={`${APP_NAME}, inicio`}
    >
      <span aria-hidden="true" className="size-[18px] orb-mark" />
      {APP_NAME}
    </Link>
  );
}
