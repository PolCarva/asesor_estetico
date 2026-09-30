import "server-only";

import { isAppError } from "@asesor/shared";
import { NextResponse } from "next/server";
import { ZodError } from "zod";

import { getLogger } from "./logger";

/** Convierte errores en respuestas JSON sin filtrar detalles internos. */
export function errorResponse(error: unknown): NextResponse {
  if (isAppError(error)) {
    return NextResponse.json({ error: error.code }, { status: error.httpStatus });
  }
  if (error instanceof ZodError) {
    return NextResponse.json({ error: "VALIDATION_FAILED" }, { status: 400 });
  }
  getLogger().error("error no controlado en API", { error });
  return NextResponse.json({ error: "INTERNAL" }, { status: 500 });
}

/** IP del cliente para rate limiting (primer valor de x-forwarded-for). */
export function clientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "unknown"
  );
}
