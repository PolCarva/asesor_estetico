import { GarmentSlotSchema } from "@asesor/shared";
import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { getLookShoppingState } from "@/lib/shopping";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Estado y progreso de la última búsqueda de productos de un look (o de una prenda, con
 * `?slot=`), para el polling del progreso (pasos 07 y 09): así no se re-renderiza toda la
 * página mientras corre.
 * Con el cliente del usuario: la RLS solo devuelve sus jobs, y nunca payload, result ni
 * last_error.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await getSessionUser())) {
      return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
    }
    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    // `?slot=`: la búsqueda de una sola prenda ("Buscar más barato", paso 09).
    const slotParam = new URL(request.url).searchParams.get("slot");
    const slot = slotParam === null ? undefined : GarmentSlotSchema.safeParse(slotParam).data;
    if (slotParam !== null && !slot) {
      return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    }
    const state = await getLookShoppingState(id, slot);
    if (!state) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json(state, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
