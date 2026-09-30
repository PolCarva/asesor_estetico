import { ClientAnalyticsEventSchema } from "@asesor/shared";
import { type NextRequest, NextResponse } from "next/server";

import { getAnalytics } from "@/lib/analytics";
import { clientIp, errorResponse } from "@/lib/api";
import { getSessionUser } from "@/lib/auth";
import { enforceRateLimit, rateLimiters } from "@/lib/rate-limit";

const MAX_BODY_BYTES = 4 * 1024;

/** Eventos de producto emitidos por el navegador. Solo nombres permitidos y propiedades chicas. */
export async function POST(request: NextRequest) {
  try {
    await enforceRateLimit(rateLimiters.analytics, `analytics:${clientIp(request.headers)}`);
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES)
      return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });

    const event = ClientAnalyticsEventSchema.parse(JSON.parse(raw));
    const user = await getSessionUser();
    await getAnalytics().trackEvent(event.name, {
      userId: user?.id ?? null,
      anonymousId: event.anonymous_id,
      path: event.path,
      properties: event.properties,
    });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    if (error instanceof SyntaxError)
      return NextResponse.json({ error: "VALIDATION_FAILED" }, { status: 400 });
    return errorResponse(error);
  }
}
