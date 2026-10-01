"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/** Secciones principales del diseño: looks, perfil (análisis) y guardados. */
const LINKS = [
  { href: "/app/looks", label: "Mis looks", short: "Looks" },
  { href: "/app/profile", label: "Mi perfil", short: "Perfil" },
  { href: "/app/favorites", label: "Guardados", short: "Guardados" },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Navegación en desktop: riel en relieve con la sección activa elevada. */
export function DesktopNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Principal" className="hidden md:block">
      <ul className="flex gap-1.5 rounded-full well p-1 text-[0.8125rem]">
        {LINKS.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`block rounded-full px-3.5 py-1.5 transition-colors ${active ? "bg-cream text-ink shadow-[0_2px_6px_rgb(48_44_30/0.15)]" : "text-stone hover:text-ink"}`}
              >
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/**
 * Barra flotante inferior en mobile. Va fuera del header: el backdrop-filter del header
 * crearía un containing block y el `fixed` quedaría pegado arriba.
 */
export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-4 bottom-[calc(env(safe-area-inset-bottom)+0.75rem)] z-40 md:hidden"
    >
      <ul className="grid grid-cols-3 gap-1 rounded-full glass p-1.5 text-sm">
        {LINKS.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-11 items-center justify-center rounded-full transition-colors ${active ? "bg-ink text-paper" : "text-stone"}`}
              >
                {link.short}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
