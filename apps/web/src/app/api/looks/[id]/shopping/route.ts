import { NextResponse } from "next/server";

import { errorResponse } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { getLookShoppingState } from "@/lib/shopping";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Estado y progreso de la última búsqueda de productos de un look, para el polling del
 * panel de progreso (paso 07): así no se re-renderiza toda la página mientras corre.
 * Con el cliente del usuario: la RLS solo devuelve sus jobs, y nunca payload, result ni
 * last_error.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    if (!(await getSessionUser())) {
      return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401 });
    }
    const { id } = await params;
    if (!UUID.test(id)) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    const state = await getLookShoppingState(id);
    if (!state) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });
    return NextResponse.json(state, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return errorResponse(error);
  }
}
