import { enqueueJob, getLatestSubscription, getProductById } from "@asesor/db";
import { createServerSupabaseClient } from "@asesor/db/server";
import { getServiceRoleClient } from "@asesor/db/service";
import { isPremiumSubscription, isProductStale } from "@asesor/shared";
import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { getLogger } from "@/lib/logger";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * "Comprar ↗" (paso 08): lleva a la página real del producto. Si el dato tiene más de
 * 8 h, encola su revalidación (REFRESH_PRODUCT, una por producto y hora) antes de
 * redirigir: la tienda muestra el precio y el stock de hoy, y la app se actualiza para la
 * próxima vez. La revalidación que bloquea (antes de agregar al carrito) es del paso 10a.
 * El destino es siempre la URL guardada del producto, nunca un parámetro (sin open redirect).
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.redirect(new URL("/login", request.url), 303);
    const { id } = await params;
    if (!UUID.test(id)) return new NextResponse("Producto no encontrado.", { status: 404 });

    const client = await createServerSupabaseClient();
    const stored = await getProductById(client, id);
    const url = stored?.product.url;
    if (!stored || !url || !/^https?:\/\//.test(url)) {
      return new NextResponse("Producto no encontrado.", { status: 404 });
    }

    if (isProductStale(stored.product.fetched_at)) {
      const premium = isPremiumSubscription(await getLatestSubscription(client, user.id));
      if (premium) {
        const hour = new Date().toISOString().slice(0, 13);
        await enqueueJob(getServiceRoleClient(), {
          type: "REFRESH_PRODUCT",
          payload: { product_id: id },
          priority: 9,
          maxAttempts: 2,
          idempotencyKey: `refresh:${id}:${hour}`,
        }).catch((error: unknown) =>
          getLogger().warn("no se pudo encolar la revalidación del producto", { error }),
        );
      }
    }
    return NextResponse.redirect(url, 303);
  } catch (error) {
    return errorResponse(error);
  }
}
