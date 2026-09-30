import { PhotoIssueCodeSchema, STYLE_PROFILE_SCHEMA_VERSION } from "@asesor/shared";
import { z } from "zod";

import { AIError, type AIErrorCode } from "../errors";
import { toStrictJsonSchema } from "../json-schema";
import {
  ANALYZE_STYLE_PROFILE_PROMPT,
  buildLookImagePrompt,
  CHAT_PROMPT,
  GENERATE_LOOK_SPECS_PROMPT,
  VALIDATE_PHOTOS_PROMPT,
} from "../prompts";
import {
  AnalyzeStyleProfileOutputSchema,
  type AnalyzeStyleProfileInput,
  type AIImageInput,
  ChatWithStyleAdvisorOutputSchema,
  type ChatWithStyleAdvisorInput,
  type GenerateLookImageInput,
  GenerateLookSpecsOutputSchema,
  type GenerateLookSpecsInput,
  type ValidatePhotosInput,
} from "../schemas";
import type { AICallOptions, AIProvider, ProviderResponse } from "../types";
import { readImageDimensions } from "./image-size";

const BASE_URL = "https://openrouter.ai/api/v1";

/**
 * Preferencias de ruteo de OpenRouter para todas las llamadas: nunca usar
 * proveedores que retengan datos o entrenen con ellos (las fotos son privadas).
 */
const PRIVATE_ROUTING = { data_collection: "deny" } as const;

/** Intentos por operación estructurada: el original más una reparación. */
const STRUCTURED_ATTEMPTS = 2;

/** Resume errores de Zod sin incluir valores (pueden describir a la persona). */
function summarizeIssues(error: z.ZodError) {
  return error.issues
    .slice(0, 6)
    .map((issue) => `${issue.path.join(".") || "(raíz)"}: ${issue.message}`)
    .join("; ")
    .slice(0, 600);
}

export interface OpenRouterProviderOptions {
  apiKey: string;
  /** Modelo con visión y structured outputs para validación, análisis, looks y chat. */
  textModel: string;
  /** Modelo de imagen que acepta fotos de referencia. */
  imageModel: string;
  imageQuality: "low" | "medium" | "high";
  /** Se envía como HTTP-Referer (atribución en OpenRouter). */
  appUrl?: string;
  fetch?: typeof fetch;
}

// --- Respuestas de OpenRouter (datos externos: se validan) ----------------------------

const UsageSchema = z
  .object({
    prompt_tokens: z.number().optional(),
    completion_tokens: z.number().optional(),
    cost: z.number().optional(),
  })
  .optional();

const ChatResponseSchema = z.object({
  model: z.string().optional(),
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable().optional(),
        message: z.object({
          content: z.string().nullable().optional(),
          refusal: z.string().nullable().optional(),
        }),
      }),
    )
    .min(1),
  usage: UsageSchema,
});

const ImageResponseSchema = z.object({
  data: z
    .array(z.object({ b64_json: z.string().min(1), media_type: z.string().optional() }))
    .min(1),
  usage: UsageSchema,
});

const ErrorBodySchema = z.object({
  error: z.object({
    message: z.string().optional(),
    code: z.unknown().optional(),
    // Detalle del proveedor final (p. ej., por qué rechazó el schema).
    metadata: z.object({ raw: z.string().optional() }).optional(),
  }),
});

function describeError(body: z.infer<typeof ErrorBodySchema>) {
  const raw = body.error.metadata?.raw;
  return [body.error.message, raw].filter(Boolean).join(" — ").slice(0, 500);
}

/** Lo que pide el modelo al validar fotos: por índice (el id lo completa el proveedor). */
const ValidationModelOutputSchema = z.object({
  results: z.array(
    z.object({
      index: z.number().int(),
      valid: z.boolean(),
      issues: z.array(
        z.object({
          code: PhotoIssueCodeSchema,
          severity: z.enum(["BLOCKING", "WARNING"]),
          message: z.string(),
        }),
      ),
      quality_score: z.number(),
    }),
  ),
  can_continue: z.boolean(),
});

function errorCodeForStatus(status: number): AIErrorCode {
  if (status === 429) return "RATE_LIMITED";
  if (status === 401 || status === 402) return "AUTH_OR_BILLING";
  if (status === 403) return "CONTENT_REJECTED";
  if (status === 408 || status === 504) return "TIMEOUT";
  if (status === 400 || status === 404 || status === 413 || status === 422) return "INVALID_INPUT";
  return "PROVIDER_ERROR";
}

type ContentPart =
  { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

const photoParts = (photos: AIImageInput[]): ContentPart[] =>
  photos.flatMap((photo, index): ContentPart[] => [
    { type: "text", text: `Foto index=${index}, tipo=${photo.type}` },
    { type: "image_url", image_url: { url: photo.url } },
  ]);

/**
 * Proveedor real vía OpenRouter (una sola API key para texto, visión e imágenes).
 * - Texto/visión: /chat/completions con `response_format: json_schema` estricto.
 * - Imágenes: /images con las fotos del usuario como referencias.
 * Devuelve el costo real informado por OpenRouter (`usage.cost`).
 */
export class OpenRouterProvider implements AIProvider {
  readonly name = "openrouter";
  private readonly fetchFn: typeof fetch;

  constructor(private readonly options: OpenRouterProviderOptions) {
    if (!options.apiKey) throw new AIError("AUTH_OR_BILLING", "Falta OPENROUTER_API_KEY.");
    this.fetchFn = options.fetch ?? fetch;
  }

  private async post(path: string, body: unknown, signal?: AbortSignal): Promise<unknown> {
    let response: Response;
    try {
      response = await this.fetchFn(`${BASE_URL}${path}`, {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.options.apiKey}`,
          "content-type": "application/json",
          "x-title": "Asesor Estetico",
          ...(this.options.appUrl ? { "http-referer": this.options.appUrl } : {}),
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError"))
        throw error;
      throw new AIError("PROVIDER_ERROR", "No se pudo conectar con OpenRouter.", { cause: error });
    }

    const text = await response.text();
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch {
      throw new AIError(
        errorCodeForStatus(response.status),
        `Respuesta no JSON de OpenRouter (HTTP ${response.status}).`,
      );
    }
    if (!response.ok) {
      const parsed = ErrorBodySchema.safeParse(json);
      const message = parsed.success ? describeError(parsed.data) : "";
      throw new AIError(
        errorCodeForStatus(response.status),
        `OpenRouter HTTP ${response.status}: ${message}`,
      );
    }
    // OpenRouter a veces responde 200 con un objeto de error.
    const errorBody = ErrorBodySchema.safeParse(json);
    if (errorBody.success) {
      throw new AIError("PROVIDER_ERROR", `OpenRouter: ${describeError(errorBody.data)}`);
    }
    return json;
  }

  /**
   * Pide JSON con schema estricto y lo valida con Zod. Si la respuesta no es JSON o
   * no cumple el schema, hace UN intento de reparación en la misma llamada: le
   * devuelve al modelo los errores (solo rutas y reglas, nunca contenido) para que
   * corrija. El uso y el costo se suman entre intentos.
   */
  private async structured(
    name: string,
    schema: z.ZodType,
    system: string,
    userContent: ContentPart[],
    options: AICallOptions = {},
  ): Promise<ProviderResponse> {
    const messages: Array<{
      role: "system" | "user" | "assistant";
      content: string | ContentPart[];
    }> = [
      { role: "system", content: system },
      { role: "user", content: userContent },
    ];
    const usage = { input_tokens: 0, output_tokens: 0, image_count: 0, estimated_cost_usd: 0 };
    let model = this.options.textModel;
    let lastProblem = "";

    for (let attempt = 1; attempt <= STRUCTURED_ATTEMPTS; attempt++) {
      const raw = await this.post(
        "/chat/completions",
        {
          model: this.options.textModel,
          temperature: 0.4,
          max_tokens: 8000,
          messages,
          response_format: {
            type: "json_schema",
            json_schema: { name, strict: true, schema: toStrictJsonSchema(schema) },
          },
          // Solo proveedores que soporten response_format (si no, el JSON no está garantizado).
          provider: { ...PRIVATE_ROUTING, require_parameters: true },
        },
        options.signal,
      );
      const parsed = ChatResponseSchema.safeParse(raw);
      if (!parsed.success)
        throw new AIError("INVALID_OUTPUT", "Respuesta de chat inesperada.", {
          cause: parsed.error,
        });
      model = parsed.data.model ?? model;
      usage.input_tokens += parsed.data.usage?.prompt_tokens ?? 0;
      usage.output_tokens += parsed.data.usage?.completion_tokens ?? 0;
      usage.estimated_cost_usd += parsed.data.usage?.cost ?? 0;

      const choice = parsed.data.choices[0];
      if (choice?.message.refusal)
        throw new AIError("CONTENT_REJECTED", "El modelo rechazó la solicitud.");
      const content = choice?.message.content;
      if (!content) {
        if (choice?.finish_reason === "content_filter")
          throw new AIError("CONTENT_REJECTED", "El modelo rechazó la solicitud.");
        lastProblem = "respuesta vacía";
        continue;
      }

      let output: unknown;
      try {
        output = JSON.parse(content.replace(/^```(?:json)?\s*|\s*```$/g, ""));
      } catch {
        lastProblem = `JSON inválido (finish_reason=${choice?.finish_reason ?? "?"})`;
        messages.push(
          { role: "assistant", content },
          {
            role: "user",
            content:
              "Tu respuesta no es JSON válido. Devolvé solo el objeto JSON completo que cumpla el schema.",
          },
        );
        continue;
      }

      const valid = schema.safeParse(output);
      if (valid.success) return { output: valid.data, model, usage };

      lastProblem = summarizeIssues(valid.error);
      messages.push(
        { role: "assistant", content },
        {
          role: "user",
          content: `Tu respuesta no cumple el schema: ${lastProblem}. Devolvé el JSON completo corregido (respetá largos máximos y cantidad de ítems).`,
        },
      );
    }
    throw new AIError(
      "INVALID_OUTPUT",
      `El modelo no devolvió un JSON válido para ${name}: ${lastProblem}`,
    );
  }

  async validatePhotos(
    input: ValidatePhotosInput,
    options?: AICallOptions,
  ): Promise<ProviderResponse> {
    const response = await this.structured(
      "photo_validation",
      ValidationModelOutputSchema,
      VALIDATE_PHOTOS_PROMPT,
      [
        { type: "text", text: `Evaluá estas ${input.photos.length} fotos.` },
        ...photoParts(input.photos),
      ],
      options,
    );
    const parsed = ValidationModelOutputSchema.parse(response.output);
    const results = input.photos.map((photo, index) => {
      const result = parsed.results.find((r) => r.index === index);
      return {
        photo_id: photo.photo_id,
        type: photo.type,
        valid: result?.valid ?? false,
        issues: (result?.issues ?? []).map((issue) => ({
          ...issue,
          message: issue.message.slice(0, 200),
        })),
        quality_score: Math.min(1, Math.max(0, result?.quality_score ?? 0)),
      };
    });
    return {
      ...response,
      output: { results, can_continue: parsed.can_continue && results.every((r) => r.valid) },
    };
  }

  analyzeStyleProfile(input: AnalyzeStyleProfileInput, options?: AICallOptions) {
    return this.structured(
      "style_profile",
      AnalyzeStyleProfileOutputSchema,
      ANALYZE_STYLE_PROFILE_PROMPT,
      [
        {
          type: "text",
          text: `País: ${input.country_code}. Nivel de riesgo elegido: ${input.preferences.risk_level}. Preferencia de tatuajes: ${input.preferences.tattoo_preference}. schema_version: ${STYLE_PROFILE_SCHEMA_VERSION}.`,
        },
        ...photoParts(input.photos),
      ],
      options,
    );
  }

  generateLookSpecs(input: GenerateLookSpecsInput, options?: AICallOptions) {
    return this.structured(
      "look_specs",
      GenerateLookSpecsOutputSchema,
      GENERATE_LOOK_SPECS_PROMPT,
      [
        {
          type: "text",
          text: `Preferencias: riesgo ${input.preferences.risk_level}, tatuajes ${input.preferences.tattoo_preference}.\nStyleProfile:\n${JSON.stringify(input.style_profile)}`,
        },
      ],
      options,
    );
  }

  chatWithStyleAdvisor(input: ChatWithStyleAdvisorInput, options?: AICallOptions) {
    const history = input.history
      .map((m) => `${m.role === "user" ? "Usuario" : "Asesor"}: ${m.content}`)
      .join("\n");
    return this.structured(
      "chat_reply",
      ChatWithStyleAdvisorOutputSchema,
      CHAT_PROMPT,
      [
        {
          type: "text",
          text: `StyleProfile: ${JSON.stringify(input.style_profile)}\nLooks: ${JSON.stringify(input.looks.map((l) => ({ name: l.name, concept: l.concept })))}\n\nConversación:\n${history}\nUsuario: ${input.message}`,
        },
      ],
      options,
    );
  }

  async generateLookImage(
    input: GenerateLookImageInput,
    options?: AICallOptions,
  ): Promise<ProviderResponse> {
    const raw = await this.post(
      "/images",
      {
        model: this.options.imageModel,
        prompt: buildLookImagePrompt(input.look),
        input_references: input.reference_photos.map((photo) => ({
          type: "image_url",
          image_url: { url: photo.url },
        })),
        n: 1,
        aspect_ratio: "3:4",
        resolution: input.variant === "PREVIEW" ? "512" : "1K",
        quality: input.variant === "PREVIEW" ? "low" : this.options.imageQuality,
        provider: PRIVATE_ROUTING,
      },
      options?.signal,
    );
    const parsed = ImageResponseSchema.safeParse(raw);
    if (!parsed.success)
      throw new AIError("INVALID_OUTPUT", "Respuesta de imagen inesperada.", {
        cause: parsed.error,
      });
    const image = parsed.data.data[0]!;
    const mimeType = image.media_type ?? "image/png";
    const size = readImageDimensions(Buffer.from(image.b64_json, "base64"));
    return {
      output: {
        mime_type: mimeType,
        base64: image.b64_json,
        width: size?.width ?? null,
        height: size?.height ?? null,
      },
      model: this.options.imageModel,
      usage: {
        input_tokens: parsed.data.usage?.prompt_tokens ?? 0,
        output_tokens: parsed.data.usage?.completion_tokens ?? 0,
        image_count: 1,
        estimated_cost_usd: parsed.data.usage?.cost ?? 0,
      },
    };
  }
}
