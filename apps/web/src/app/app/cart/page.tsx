import type { Metadata } from "next";

import { PaywallCard } from "@/components/paywall-card";
import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { requireUser } from "@/lib/auth";
import { getPlan } from "@/lib/data";
import { createServerSupabaseClient } from "@asesor/db/server";

export const metadata: Metadata = { title: "Carrito" };

const AVAILABILITY_LABEL = {
  IN_STOCK: "En stock",
  OUT_OF_STOCK: "Sin stock",
  UNKNOWN: "Stock a confirmar",
  IN_STORE_ONLY: "Solo en tienda",
} as const;

export default async function CartPage() {
  const user = await requireUser("/app/cart");
  const plan = await getPlan(user.id);

  if (!plan.isPremium) {
    return (
      <>
        <PageHeader
          eyebrow="Carrito externo"
          title="Tu carrito"
          description="Armá tu lista de compras y comprá directo en cada tienda."
        />
        <div className="max-w-md">
          <PaywallCard />
        </div>
      </>
    );
  }

  const supabase = await createServerSupabaseClient();
  const { data: items } = await supabase
    .from("cart_items")
    .select(
      "id, quantity, price_amount_snapshot, currency_snapshot, products(title, store_name, url, availability)",
    )
    .order("created_at");

  return (
    <>
      <PageHeader
        eyebrow="Carrito externo"
        title="Tu carrito"
        description="La compra se hace en cada tienda. Antes de derivarte revalidamos precio y stock."
      />
      {!items || items.length === 0 ? (
        <EmptyState
          title="Tu carrito está vacío"
          description="Agregá productos desde tus looks para armar tu lista de compras."
          action={
            <LinkButton href="/app/looks" variant="secondary">
              Ver looks
            </LinkButton>
          }
        />
      ) : (
        <ul className="space-y-4">
          {items.map((item) =>
            item.products ? (
              <li key={item.id}>
                <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="eyebrow">{item.products.store_name}</p>
                    <h2 className="mt-1 text-xl">{item.products.title}</h2>
                    <p className="mt-1 text-sm text-stone">
                      {item.quantity} × {item.currency_snapshot}{" "}
                      {item.price_amount_snapshot.toLocaleString("es-UY")} ·{" "}
                      {AVAILABILITY_LABEL[item.products.availability]}
                    </p>
                  </div>
                  <a
                    href={item.products.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    className="text-sm text-ink underline underline-offset-4"
                  >
                    Ver en la tienda<span className="sr-only"> (se abre en otra pestaña)</span>
                  </a>
                </Card>
              </li>
            ) : null,
          )}
        </ul>
      )}
    </>
  );
}
