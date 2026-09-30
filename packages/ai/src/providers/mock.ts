import { FIXTURE_LOOK_SPECS, FIXTURE_STYLE_PROFILE } from "@asesor/shared/fixtures";

import { AIError, type AIErrorCode } from "../errors";
import type {
  AnalyzeStyleProfileInput,
  ChatWithStyleAdvisorInput,
  GenerateLookImageInput,
  GenerateLookSpecsInput,
  ValidatePhotosInput,
} from "../schemas";
import type { AIProvider, ProviderResponse } from "../types";

/** PNG 1x1 válido: imagen placeholder de los looks generados por el mock. */
export const MOCK_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

/** Hash FNV-1a: mismo input → mismo output. */
export function stableHash(value: unknown): number {
  const text = JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

const estimateTokens = (value: unknown) => Math.ceil(JSON.stringify(value).length / 4);

export interface MockAIProviderOptions {
  /** Hace fallar todas las operaciones con este código (para tests). */
  failWith?: AIErrorCode;
  latencyMs?: number;
}

/**
 * Proveedor determinístico para desarrollo y tests. No hace llamadas de red ni
 * cuesta dinero. Reglas:
 *  - una foto cuya URL contiene "blurry" falla la validación por LOW_QUALITY;
 *  - el perfil y los looks salen de los fixtures, ajustados a las preferencias.
 */
export class MockAIProvider implements AIProvider {
  readonly name = "mock";

  constructor(private readonly options: MockAIProviderOptions = {}) {}

  private async respond(
    input: unknown,
    output: unknown,
    model: string,
    imageCount = 0,
  ): Promise<ProviderResponse> {
    if (this.options.latencyMs) await new Promise((r) => setTimeout(r, this.options.latencyMs));
    if (this.options.failWith) throw new AIError(this.options.failWith, "Fallo simulado del mock.");
    return {
      output,
      model,
      usage: {
        input_tokens: estimateTokens(input),
        output_tokens: estimateTokens(output),
        image_count: imageCount,
        estimated_cost_usd: 0,
      },
    };
  }

  validatePhotos(input: ValidatePhotosInput) {
    const results = input.photos.map((photo) => {
      const blurry = photo.url.includes("blurry");
      return {
        photo_id: photo.photo_id,
        type: photo.type,
        valid: !blurry,
        issues: blurry
          ? [
              {
                code: "LOW_QUALITY" as const,
                severity: "BLOCKING" as const,
                message: "La foto está borrosa.",
              },
            ]
          : [],
        quality_score: blurry ? 0.2 : 0.7 + (stableHash(photo.photo_id) % 30) / 100,
      };
    });
    return this.respond(
      input,
      { results, can_continue: results.every((r) => r.valid) },
      "mock-vision-1",
    );
  }

  analyzeStyleProfile(input: AnalyzeStyleProfileInput) {
    const profile = {
      ...FIXTURE_STYLE_PROFILE,
      tattoos: {
        ...FIXTURE_STYLE_PROFILE.tattoos,
        preference: input.preferences.tattoo_preference,
        // Como pide el prompt: sin ideas de tatuajes si el usuario prefiere cubrirlos.
        ...(input.preferences.tattoo_preference === "COVER"
          ? { suggestions: [], placements: [] }
          : {}),
      },
      style_direction: {
        ...FIXTURE_STYLE_PROFILE.style_direction,
        risk_level: input.preferences.risk_level,
      },
    };
    return this.respond(input, profile, "mock-vision-1");
  }

  generateLookSpecs(input: GenerateLookSpecsInput) {
    const suffix = (stableHash(input) % 1_000_000).toString(36);
    const looks = FIXTURE_LOOK_SPECS.map((look) => ({ ...look, id: `${look.id}-${suffix}` }));
    return this.respond(input, { looks }, "mock-text-1");
  }

  generateLookImage(input: GenerateLookImageInput) {
    const output = { mime_type: "image/png", base64: MOCK_PNG_BASE64, width: 1, height: 1 };
    return this.respond({ look: input.look.id, variant: input.variant }, output, "mock-image-1", 1);
  }

  chatWithStyleAdvisor(input: ChatWithStyleAdvisorInput) {
    const direction = input.style_profile.style_direction.primary;
    const color =
      input.style_profile.colors.best[
        stableHash(input.message) % input.style_profile.colors.best.length
      ];
    const output = {
      reply: `Para tu estilo ${direction}, probá sumar ${color?.name ?? "un color de tu paleta"} cerca de la cara y mantené fits limpios.`,
      suggestions: ["¿Qué calzado combina?", "¿Cómo lo adapto al invierno?"],
    };
    return this.respond(input, output, "mock-text-1");
  }
}
