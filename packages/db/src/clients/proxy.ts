import { getPublicEnv } from "@asesor/config/env/public";
import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";

/**
 * Refresca la sesión de Supabase en cada request (proxy de Next.js) y devuelve
 * la respuesta con las cookies actualizadas junto con el id del usuario, si hay.
 */
export async function updateSession(
  request: NextRequest,
): Promise<{ response: NextResponse; userId: string | null }> {
  const env = getPublicEnv();
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookiesToSet, headers) => {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
          for (const [key, value] of Object.entries(headers ?? {})) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  // getUser() valida contra Supabase Auth (como requireUser en las páginas) y refresca
  // la sesión si hace falta. Con solo validar la firma del JWT, una cookie de un
  // usuario borrado (p. ej., tras `pnpm db:reset`) generaba un loop /login ↔ /app.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    const hasAuthCookie = request.cookies.getAll().some((c) => c.name.startsWith("sb-"));
    // Sesión rechazada por Auth (4xx): se borran las cookies. Ante un error 5xx o de red no.
    if (hasAuthCookie && error?.status !== undefined && error.status < 500) {
      await supabase.auth.signOut({ scope: "local" });
    }
    return { response, userId: null };
  }
  return { response, userId: data.user.id };
}
