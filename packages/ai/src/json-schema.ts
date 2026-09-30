import { z } from "zod";

type JsonSchema = { [key: string]: unknown };

/** Palabras clave que no todos los proveedores aceptan en structured outputs estrictos. */
const UNSUPPORTED = new Set([
  "$schema",
  "format",
  "minLength",
  "maxLength",
  "minItems",
  "maxItems",
  "minimum",
  "maximum",
  "exclusiveMinimum",
  "exclusiveMaximum",
  "default",
]);

function strictify(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(strictify);
  if (!node || typeof node !== "object") return node;
  const out: JsonSchema = {};
  for (const [key, value] of Object.entries(node)) {
    if (UNSUPPORTED.has(key)) continue;
    out[key] = strictify(value);
  }
  if (out.type === "object" && out.properties && typeof out.properties === "object") {
    // Modo estricto: todas las propiedades requeridas y sin propiedades extra.
    out.required = Object.keys(out.properties);
    out.additionalProperties = false;
  }
  return out;
}

/**
 * JSON Schema estricto para `response_format: json_schema` a partir de un schema Zod.
 * Los límites de largo y cantidad se sacan (no todos los proveedores los soportan):
 * siguen aplicándose al validar la respuesta con el mismo schema Zod.
 */
export function toStrictJsonSchema(schema: z.ZodType): JsonSchema {
  return strictify(z.toJSONSchema(schema, { io: "output", unrepresentable: "any" })) as JsonSchema;
}
