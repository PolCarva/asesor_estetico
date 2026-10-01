import type { Metadata } from "next";

import { LinkButton } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/states";
import { requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@asesor/db/server";

export const metadata: Metadata = { title: "Guardados" };

export default async function FavoritesPage() {
  const user = await requireUser("/app/favorites");
  const supabase = await createServerSupabaseClient();
  const { data: favorites } = await supabase
    .from("favorites")
    .select(
      "id, created_at, looks(name, position), products(title, store_name, price_amount, currency)",
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  return (
    <>
      <PageHeader
        eyebrow="Guardados"
        title={
          <>
            Lo que <em>guardaste.</em>
          </>
        }
        description="Los looks y productos que guardaste para volver a verlos."
      />
      {!favorites || favorites.length === 0 ? (
        <EmptyState
          title="Nada guardado todavía"
          description="Cuando veas un look o un producto que te guste, guardalo para volver a encontrarlo."
          action={
            <LinkButton href="/app/looks" variant="secondary">
              Ver looks
            </LinkButton>
          }
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {favorites.map((fav) => (
            <li key={fav.id}>
              <Card>
                {fav.looks ? (
                  <>
                    <p className="eyebrow">Look {fav.looks.position}</p>
                    <h2 className="mt-2 text-2xl">{fav.looks.name}</h2>
                  </>
                ) : fav.products ? (
                  <>
                    <p className="eyebrow">{fav.products.store_name}</p>
                    <h2 className="mt-2 text-2xl">{fav.products.title}</h2>
                    <p className="mt-1 text-sm text-stone">
                      {fav.products.price_amount === null
                        ? "Precio a consultar en el local"
                        : `${fav.products.currency} ${fav.products.price_amount.toLocaleString("es-UY")}`}
                    </p>
                  </>
                ) : (
                  <p className="text-sm text-stone">Contenido no disponible.</p>
                )}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
