import { FIXTURE_LOOK_SPECS, FIXTURE_STYLE_PROFILE } from "@asesor/shared/fixtures";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  AIError,
  ANALYZE_STYLE_PROFILE_PROMPT,
  analyzeStyleProfile,
  buildLookImagePrompt,
  chatWithStyleAdvisor,
  generateLookImage,
  generateLookSpecs,
  MockAIProvider,
  OpenRouterProvider,
  PROMPT_VERSION,
  readImageDimensions,
  toStrictJsonSchema,
  validatePhotos,
} from "../src";
import type { AIProvider } from "../src/types";

const photo = (id: string, url = "https://storage.test/signed/photo.jpg") => ({
  photo_id: id,
  type: "MAIN_BODY" as const,
  url,
});
const ID_A = "0b5a1c3e-8f5d-4c1b-9d2e-1a2b3c4d5e6f";
const ID_B = "1c6b2d4f-9a6e-4d2c-8e3f-2b3c4d5e6f70";
const preferences = { risk_level: "BOLD" as const, tattoo_preference: "HIGHLIGHT" as const };

describe("MockAIProvider + operaciones", () => {
  const provider = new MockAIProvider();

  it("es determinístico", async () => {
    const input = { style_profile: FIXTURE_STYLE_PROFILE, preferences, count: 3 as const };
    const a = await generateLookSpecs(provider, input);
    const b = await generateLookSpecs(provider, input);
    expect(a.data).toEqual(b.data);
    expect(a.data.looks).toHaveLength(3);
  });

  it("valida fotos y detecta problemas", async () => {
    const ok = await validatePhotos(provider, { photos: [photo(ID_A)] });
    expect(ok.data.can_continue).toBe(true);
    const bad = await validatePhotos(provider, {
      photos: [photo(ID_A), photo(ID_B, "https://x.test/blurry.jpg")],
    });
    expect(bad.data.can_continue).toBe(false);
    expect(bad.data.results[1]?.issues[0]?.code).toBe("LOW_QUALITY");
  });

  it("respeta las preferencias en el StyleProfile", async () => {
    const result = await analyzeStyleProfile(provider, {
      photos: [photo(ID_A)],
      preferences,
      country_code: "UY",
    });
    expect(result.data.style_direction.risk_level).toBe("BOLD");
    expect(result.data.tattoos.preference).toBe("HIGHLIGHT");
    expect(result.data.schema_version).toBe(2);
    expect(result.data.hair.barber_instructions).not.toBe("");

    const cover = await analyzeStyleProfile(provider, {
      photos: [photo(ID_A)],
      preferences: { ...preferences, tattoo_preference: "COVER" },
      country_code: "UY",
    });
    expect(cover.data.tattoos).toMatchObject({ suggestions: [], placements: [] });
  });

  it("devuelve usage y timing", async () => {
    const [look] = FIXTURE_LOOK_SPECS;
    const result = await generateLookImage(provider, {
      look,
      reference_photos: [photo(ID_A)],
      variant: "PREVIEW",
    });
    expect(result.usage).toMatchObject({
      provider: "mock",
      model: "mock-image-1",
      image_count: 1,
      estimated_cost_usd: 0,
    });
    expect(result.timing.duration_ms).toBeGreaterThanOrEqual(0);
    expect(result.operation).toBe("GENERATE_LOOK_IMAGE");
  });

  it("responde el chat", async () => {
    const result = await chatWithStyleAdvisor(provider, {
      style_profile: FIXTURE_STYLE_PROFILE,
      looks: [],
      history: [],
      message: "¿Qué me pongo para un casamiento?",
    });
    expect(result.data.reply).toContain("smart casual");
  });
});

describe("errores normalizados", () => {
  it("INVALID_INPUT cuando el input no cumple el schema", async () => {
    await expect(validatePhotos(new MockAIProvider(), { photos: [] })).rejects.toMatchObject({
      code: "INVALID_INPUT",
      operation: "VALIDATE_PHOTOS",
      provider: "mock",
    });
  });

  it("INVALID_OUTPUT (reintentable) cuando el proveedor devuelve basura", async () => {
    const broken = new MockAIProvider();
    broken.validatePhotos = async () => ({
      output: { nope: true },
      model: "x",
      usage: { input_tokens: 0, output_tokens: 0, image_count: 0, estimated_cost_usd: 0 },
    });
    await expect(validatePhotos(broken, { photos: [photo(ID_A)] })).rejects.toMatchObject({
      code: "INVALID_OUTPUT",
    });
  });

  it("TIMEOUT cuando el proveedor tarda demasiado", async () => {
    const slow = new MockAIProvider({ latencyMs: 200 });
    await expect(
      validatePhotos(slow, { photos: [photo(ID_A)] }, { timeoutMs: 10 }),
    ).rejects.toMatchObject({
      code: "TIMEOUT",
      retryable: true,
    });
  });

  it("propaga fallos simulados y marca reintentables", async () => {
    const failing: AIProvider = new MockAIProvider({ failWith: "RATE_LIMITED" });
    const error = await validatePhotos(failing, { photos: [photo(ID_A)] }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AIError);
    expect(error).toMatchObject({ code: "RATE_LIMITED", retryable: true });
  });
});

describe("prompts", () => {
  it("el prompt de análisis fija las reglas de la asesoría y los límites", () => {
    expect(PROMPT_VERSION).toBe("2026-09-30.2");
    const prompt = ANALYZE_STYLE_PROFILE_PROMPT;
    expect(prompt).toContain("Nunca das puntuaciones ni opiniones de atractivo");
    expect(prompt).toContain("No hacés análisis médico");
    expect(prompt).toContain("estructura facial, la altura, el cuerpo, el peso, la musculatura");
    expect(prompt).toContain("concreta, breve y aplicable");
    expect(prompt).toContain("máximo 120 caracteres");
    expect(prompt).toContain("barber_instructions (máximo 400");
    for (const block of [
      "recommended_cut",
      "sides",
      "texture_tips",
      "facial_hair",
      "eyebrows",
      "pant_cuts",
      "layering",
      "shoes.avoid",
      "jewelry",
      "eyewear",
      "placements",
      "general_advice",
    ])
      expect(prompt).toContain(block);
  });

  it("arma el prompt de imagen desde el LookSpec", () => {
    const prompt = buildLookImagePrompt(FIXTURE_LOOK_SPECS[0]);
    expect(prompt).toContain("camisa oxford, crudo, algodón");
    expect(prompt).toContain("SAME person");
    expect(prompt).toContain("Do not slim, reshape");
  });
});

/** fetch falso que registra los requests y devuelve respuestas preparadas. */
function fakeFetch(responses: Array<{ status?: number; body: unknown }>) {
  const calls: Array<{
    url: string;
    body: Record<string, unknown>;
    headers: Record<string, string>;
  }> = [];
  const fn = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      body: JSON.parse(String(init.body)),
      headers: init.headers as Record<string, string>,
    });
    const next = responses.shift() ?? {
      status: 500,
      body: { error: { message: "sin respuesta" } },
    };
    return new Response(JSON.stringify(next.body), { status: next.status ?? 200 });
  }) as unknown as typeof fetch;
  return { fn, calls };
}

const chatReply = (content: unknown, cost = 0.002) => ({
  model: "google/gemini-3.8-flash",
  choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }],
  usage: { prompt_tokens: 1000, completion_tokens: 200, cost },
});

const openrouter = (fetchFn: typeof fetch) =>
  new OpenRouterProvider({
    apiKey: "test-key",
    textModel: "google/gemini-3.8-flash",
    imageModel: "google/gemini-3.1-flash-image",
    imageQuality: "medium",
    fetch: fetchFn,
  });

const dataPhoto = (id: string, type: "MAIN_BODY" | "FACE_DETAIL" = "MAIN_BODY") => ({
  photo_id: id,
  type,
  url: "data:image/jpeg;base64,/9j/4AAQ",
});

describe("OpenRouterProvider (fetch simulado)", () => {
  it("valida fotos con JSON schema estricto y mapea resultados por índice", async () => {
    const { fn, calls } = fakeFetch([
      {
        body: chatReply({
          results: [
            {
              index: 1,
              valid: false,
              issues: [
                { code: "FACE_NOT_VISIBLE", severity: "BLOCKING", message: "No se ve el rostro." },
              ],
              quality_score: 0.4,
            },
            { index: 0, valid: true, issues: [], quality_score: 0.9 },
          ],
          can_continue: true,
        }),
      },
    ]);
    const result = await validatePhotos(openrouter(fn), {
      photos: [dataPhoto(ID_A), dataPhoto(ID_B, "FACE_DETAIL")],
    });

    expect(calls[0]?.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(calls[0]?.headers.authorization).toBe("Bearer test-key");
    const body = calls[0]!.body as {
      response_format: { json_schema: { strict: boolean } };
      provider: Record<string, unknown>;
      messages: Array<{ content: unknown }>;
    };
    expect(body.response_format.json_schema.strict).toBe(true);
    expect(body.provider).toEqual({ data_collection: "deny", require_parameters: true });
    expect(JSON.stringify(body.messages[1]?.content)).toContain("data:image/jpeg;base64");

    expect(result.data.results.map((r) => [r.photo_id, r.valid])).toEqual([
      [ID_A, true],
      [ID_B, false],
    ]);
    // can_continue nunca queda en true si hay una foto inválida.
    expect(result.data.can_continue).toBe(false);
    expect(result.usage).toMatchObject({
      provider: "openrouter",
      input_tokens: 1000,
      output_tokens: 200,
      estimated_cost_usd: 0.002,
    });
  });

  it("analiza el perfil y genera looks validando contra los schemas del dominio", async () => {
    const { fn } = fakeFetch([
      { body: chatReply(FIXTURE_STYLE_PROFILE) },
      { body: chatReply({ looks: FIXTURE_LOOK_SPECS }) },
    ]);
    const provider = openrouter(fn);
    const profile = await analyzeStyleProfile(provider, {
      photos: [dataPhoto(ID_A)],
      preferences,
      country_code: "UY",
    });
    expect(profile.data.style_direction.primary).toBe(
      FIXTURE_STYLE_PROFILE.style_direction.primary,
    );
    const looks = await generateLookSpecs(provider, {
      style_profile: profile.data,
      preferences,
      count: 3,
    });
    expect(looks.data.looks).toHaveLength(3);
  });

  it("pide el StyleProfile v2 con JSON schema estricto (asesoría completa)", async () => {
    const { fn, calls } = fakeFetch([{ body: chatReply(FIXTURE_STYLE_PROFILE) }]);
    const result = await analyzeStyleProfile(openrouter(fn), {
      photos: [dataPhoto(ID_A)],
      preferences,
      country_code: "UY",
    });
    expect(result.data.general_advice).toEqual(FIXTURE_STYLE_PROFILE.general_advice);

    const body = calls[0]!.body as {
      max_tokens: number;
      messages: Array<{ role: string; content: unknown }>;
      response_format: {
        json_schema: { name: string; strict: boolean; schema: Record<string, unknown> };
      };
    };
    expect(body.messages[0]?.content).toBe(ANALYZE_STYLE_PROFILE_PROMPT);
    expect(JSON.stringify(body.messages[1]?.content)).toContain("schema_version: 2.");
    const { name, strict, schema } = body.response_format.json_schema;
    expect([name, strict]).toEqual(["style_profile", true]);
    type Node = {
      properties: Record<string, Node>;
      required: string[];
      additionalProperties: boolean;
    };
    const root = schema as unknown as Node;
    expect(root.properties.schema_version).toEqual({ type: "number", const: 2 });
    expect(root.required).toContain("general_advice");
    const hair = root.properties.hair!;
    expect(hair.additionalProperties).toBe(false);
    expect(hair.required).toEqual(
      expect.arrayContaining(["recommended_cut", "sides", "texture_tips", "barber_instructions"]),
    );
    expect(root.properties.grooming!.properties.facial_hair!.required).toEqual([
      "recommended",
      "avoid",
    ]);
    expect(root.properties.accessories!.required).toEqual(
      expect.arrayContaining(["jewelry", "eyewear", "avoid"]),
    );
    const text = JSON.stringify(schema);
    expect(text).not.toMatch(/maxLength|maxItems/);
    // Solo los 3 nullable de v1 (eye_color, season, secondary): lo nuevo no agrega anyOf.
    expect(text.match(/"anyOf"/g)).toHaveLength(3);
  });

  it("genera la imagen con las fotos como referencia y registra el costo real", async () => {
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const { fn, calls } = fakeFetch([
      {
        body: {
          data: [{ b64_json: png, media_type: "image/png" }],
          usage: { completion_tokens: 1120, cost: 0.067 },
        },
      },
    ]);
    const result = await generateLookImage(openrouter(fn), {
      look: FIXTURE_LOOK_SPECS[0],
      reference_photos: [dataPhoto(ID_A), dataPhoto(ID_B, "FACE_DETAIL")],
      variant: "FULL",
    });
    expect(calls[0]?.url).toBe("https://openrouter.ai/api/v1/images");
    expect(calls[0]?.body).toMatchObject({
      model: "google/gemini-3.1-flash-image",
      aspect_ratio: "3:4",
      resolution: "1K",
      quality: "medium",
      provider: { data_collection: "deny" },
    });
    expect((calls[0]?.body.input_references as unknown[]).length).toBe(2);
    expect(result.data).toMatchObject({ mime_type: "image/png", width: 1, height: 1 });
    expect(result.usage).toMatchObject({ image_count: 1, estimated_cost_usd: 0.067 });
  });

  it("normaliza errores HTTP", async () => {
    const cases: Array<[number, string, boolean]> = [
      [429, "RATE_LIMITED", true],
      [402, "AUTH_OR_BILLING", false],
      [401, "AUTH_OR_BILLING", false],
      [502, "PROVIDER_ERROR", true],
      [400, "INVALID_INPUT", false],
    ];
    for (const [status, code, retryable] of cases) {
      const { fn } = fakeFetch([{ status, body: { error: { message: "x" } } }]);
      await expect(
        validatePhotos(openrouter(fn), { photos: [dataPhoto(ID_A)] }),
      ).rejects.toMatchObject({ code, retryable });
    }
  });

  it("repara una respuesta que no cumple el schema con un segundo intento", async () => {
    const bad = { ...FIXTURE_STYLE_PROFILE, strengths: Array.from({ length: 20 }, () => "x") };
    const { fn, calls } = fakeFetch([
      { body: chatReply(bad, 0.01) },
      { body: chatReply(FIXTURE_STYLE_PROFILE, 0.01) },
    ]);
    const result = await analyzeStyleProfile(openrouter(fn), {
      photos: [dataPhoto(ID_A)],
      preferences,
      country_code: "UY",
    });
    expect(calls).toHaveLength(2);
    const repair = JSON.stringify((calls[1]!.body as { messages: unknown[] }).messages.at(-1));
    expect(repair).toContain("strengths");
    expect(repair).not.toContain('"x"'); // no reenvía valores, solo rutas y reglas
    expect(result.usage.estimated_cost_usd).toBeCloseTo(0.02);
  });

  it("falla con INVALID_OUTPUT (reintentable) si tampoco lo repara", async () => {
    const { fn } = fakeFetch([
      { body: chatReply({ nope: 1 }) },
      { body: { choices: [{ finish_reason: "length", message: { content: '{"trunc' } }] } },
    ]);
    await expect(
      analyzeStyleProfile(openrouter(fn), {
        photos: [dataPhoto(ID_A)],
        preferences,
        country_code: "UY",
      }),
    ).rejects.toMatchObject({ code: "INVALID_OUTPUT", retryable: true });
  });

  it("rechazo del modelo → CONTENT_REJECTED", async () => {
    const { fn } = fakeFetch([
      {
        body: {
          choices: [{ finish_reason: "stop", message: { content: null, refusal: "no puedo" } }],
        },
      },
    ]);
    await expect(
      validatePhotos(openrouter(fn), { photos: [dataPhoto(ID_A)] }),
    ).rejects.toMatchObject({
      code: "CONTENT_REJECTED",
      retryable: false,
    });
  });

  it("no acepta URLs que no sean imágenes", async () => {
    const { fn } = fakeFetch([]);
    await expect(
      validatePhotos(openrouter(fn), {
        photos: [{ ...dataPhoto(ID_A), url: "javascript:alert(1)" }],
      }),
    ).rejects.toMatchObject({ code: "INVALID_INPUT" });
  });
});

describe("utilidades", () => {
  it("toStrictJsonSchema: objetos estrictos y sin límites no soportados", () => {
    const schema = JSON.stringify(
      toStrictJsonSchema(
        z.object({ a: z.string().max(3), b: z.array(z.uuid()).max(2).nullable() }),
      ),
    );
    expect(schema).toContain('"additionalProperties":false');
    expect(schema).toContain('"required":["a","b"]');
    expect(schema).not.toMatch(/maxLength|maxItems|"format"/);
  });

  it("readImageDimensions lee PNG y JPEG", () => {
    const png = Uint8Array.from(
      atob(
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      ),
      (c) => c.charCodeAt(0),
    );
    expect(readImageDimensions(png)).toEqual({ width: 1, height: 1 });
    const jpeg = new Uint8Array([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x02, 0x00, 0x01, 0x80, 0x03, 0, 0, 0, 0,
    ]);
    expect(readImageDimensions(jpeg)).toEqual({ width: 384, height: 512 });
    expect(readImageDimensions(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
