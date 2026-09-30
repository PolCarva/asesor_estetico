import { createServerSupabaseClient } from "@asesor/db/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { safeNextPath } from "@/lib/safe-redirect";

const QuerySchema = z.object({
  token_hash: z.string().min(1).max(512),
  type: z.enum(["signup", "email", "recovery", "email_change", "invite", "magiclink"]),
  next: z.string().optional(),
});

/** Confirmación de email (cuando enable_confirmations está activo). */
export async function GET(request: NextRequest) {
  const parsed = QuerySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  const target = request.nextUrl.clone();
  target.search = "";

  if (parsed.success) {
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.auth.verifyOtp({
      token_hash: parsed.data.token_hash,
      type: parsed.data.type as EmailOtpType,
    });
    if (!error) {
      target.pathname = safeNextPath(parsed.data.next, "/app/onboarding");
      return NextResponse.redirect(target);
    }
  }
  target.pathname = "/login";
  return NextResponse.redirect(target);
}
