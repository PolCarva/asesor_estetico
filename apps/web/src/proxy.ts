import { updateSession } from "@asesor/db/proxy";
import { type NextRequest, NextResponse } from "next/server";

const PROTECTED_PREFIXES = ["/app", "/admin"];

/** Redirige conservando las cookies de sesión que haya actualizado updateSession. */
function redirectWithSession(url: URL, sessionResponse: NextResponse) {
  const redirect = NextResponse.redirect(url);
  for (const cookie of sessionResponse.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}
const AUTH_PAGES = ["/login", "/signup"];

/**
 * Refresca la sesión de Supabase y hace la primera barrera de rutas protegidas.
 * No es la única: cada página y endpoint vuelve a validar en el servidor.
 */
export async function proxy(request: NextRequest) {
  const { response, userId } = await updateSession(request);
  const { pathname, search } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`),
  );
  if (isProtected && !userId) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = `?next=${encodeURIComponent(pathname + search)}`;
    return redirectWithSession(url, response);
  }

  if (AUTH_PAGES.includes(pathname) && userId) {
    const url = request.nextUrl.clone();
    url.pathname = "/app/dashboard";
    url.search = "";
    return redirectWithSession(url, response);
  }

  return response;
}

export const config = {
  matcher: [
    // Todo menos estáticos, íconos, manifest, service worker y webhooks (que no usan cookies).
    "/((?!_next/static|_next/image|icons/|favicon.ico|icon|apple-icon|manifest.webmanifest|sw.js|offline|api/webhooks).*)",
  ],
};
