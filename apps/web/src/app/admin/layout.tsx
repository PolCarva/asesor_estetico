import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { Logo } from "@/components/logo";
import { requireAdminUser } from "@/lib/auth";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };

const LINKS = [
  ["/admin", "Overview"],
  ["/admin/users", "Users"],
  ["/admin/jobs", "Jobs"],
  ["/admin/ai-usage", "AI Usage"],
  ["/admin/analytics", "Analytics"],
  ["/admin/products", "Products"],
  ["/admin/subscriptions", "Subscriptions"],
] as const;

/** Protegido en el servidor por rol admin (profiles.role). Quien no es admin recibe 404. */
export default async function AdminLayout({ children }: { children: ReactNode }) {
  const admin = await requireAdminUser();
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-paper">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <div className="flex items-center gap-3">
            <Logo href="/admin" />
            <span className="rounded-full bg-ink px-2.5 py-1 text-xs text-ivory">admin</span>
          </div>
          <p className="text-xs text-stone">{admin.email}</p>
        </div>
        <nav aria-label="Admin" className="mx-auto max-w-7xl overflow-x-auto px-5 sm:px-8">
          <ul className="flex gap-1 pb-3">
            {LINKS.map(([href, label]) => (
              <li key={href}>
                <Link
                  href={href}
                  className="block rounded-full px-3 py-1.5 text-sm whitespace-nowrap text-stone hover:bg-sand hover:text-ink"
                >
                  {label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main id="contenido" className="mx-auto max-w-7xl px-5 py-10 sm:px-8">
        {children}
      </main>
    </div>
  );
}
