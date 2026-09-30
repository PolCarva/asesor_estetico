"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/app/dashboard", label: "Inicio", icon: "M4 11l8-7 8 7v9H4z" },
  { href: "/app/looks", label: "Looks", icon: "M8 4h8l3 5-3 2v9H8v-9L5 9z" },
  {
    href: "/app/favorites",
    label: "Favoritos",
    icon: "M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z",
  },
  { href: "/app/cart", label: "Carrito", icon: "M5 7h14l-1.5 12h-11zM9 7a3 3 0 0 1 6 0" },
  {
    href: "/app/profile",
    label: "Perfil",
    icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0",
  },
] as const;

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Navegación principal en desktop (dentro del header). */
export function DesktopNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
      {LINKS.map((link) => {
        const active = isActive(pathname, link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={active ? "page" : undefined}
            className={`rounded-full px-4 py-2 text-sm transition-colors ${active ? "bg-ink text-ivory" : "text-stone hover:text-ink"}`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * Tab bar inferior en mobile. Va fuera del header: el backdrop-filter del header
 * crearía un containing block y el `fixed` quedaría pegado arriba.
 */
export function MobileNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-line bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
    >
      <ul className="grid grid-cols-5">
        {LINKS.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <li key={link.href}>
              <Link
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-col items-center gap-1 py-3 text-[0.68rem] ${active ? "text-ink" : "text-stone"}`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={active ? 1.8 : 1.3}
                  aria-hidden="true"
                >
                  <path d={link.icon} strokeLinejoin="round" />
                </svg>
                {link.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
