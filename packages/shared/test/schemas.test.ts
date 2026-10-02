import { describe, expect, it } from "vitest";
import { z } from "zod";

import {
  AnalyticsEventSchema,
  CartSchema,
  checkPhotoFile,
  ClientAnalyticsEventSchema,
  computeRetryDelaySeconds,
  JobPayloadSchemas,
  JobTypeSchema,
  listLookGarments,
  LookSpecSchema,
  PhotoValidationResultSchema,
  ProductSchema,
  ShoppingQuerySchema,
  sniffImageMimeType,
  StyleProfileSchema,
  SubscriptionStatusSchema,
  isPremiumSubscription,
  mergeStyleProfile,
  parseStoredStyleProfile,
  splitStyleProfile,
  StyleAdviceSchema,
  StoredLookSpecSchema,
  StyleProfileCoreSchema,
  StyleProfileV1Schema,
  StyleProfileV2Schema,
} from "../src";
import {
  FIXTURE_LOOK_SPECS,
  FIXTURE_PRODUCTS,
  FIXTURE_STYLE_PROFILE,
  FIXTURE_STYLE_PROFILE_V1,
  FIXTURE_STYLE_PROFILE_V2,
} from "../src/fixtures";

const UUID = "0b5a1c3e-8f5d-4c1b-9d2e-1a2b3c4d5e6f";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const WEBP = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");

describe("fixtures cumplen los schemas", () => {
  it("StyleProfile", () => {
    expect(StyleProfileSchema.parse(FIXTURE_STYLE_PROFILE)).toEqual(FIXTURE_STYLE_PROFILE);
    expect(StyleProfileV2Schema.parse(FIXTURE_STYLE_PROFILE_V2)).toEqual(FIXTURE_STYLE_PROFILE_V2);
    expect(StyleProfileV1Schema.parse(FIXTURE_STYLE_PROFILE_V1)).toEqual(FIXTURE_STYLE_PROFILE_V1);
  });
  it("LookSpecs", () => {
    for (const look of FIXTURE_LOOK_SPECS)
      expect(LookSpecSchema.safeParse(look).success).toBe(true);
  });
  it("Products", () => {
    for (const product of FIXTURE_PRODUCTS)
      expect(ProductSchema.safeParse(product).success).toBe(true);
  });
});

describe("StyleProfile v3: asesoría completa", () => {
  it("cubre cada tema del SPEC con datos estructurados", () => {
    const p = FIXTURE_STYLE_PROFILE;
    expect(p.schema_version).toBe(3);
    // perfil visual: rasgos del rostro, silueta y proporciones
    expect(p.appearance.face_features.length).toBeGreaterThan(0);
    expect(p.appearance.body_shape).toBe("TRAPEZOID");
    expect(p.appearance.torso_legs).toBe("LONG_LEGS");
    // pelo: corte, largo, laterales, textura, peinado, evitar e indicaciones al peluquero
    expect(p.hair.recommended_cut).not.toBe("");
    expect(p.hair.recommended_length).not.toBe("");
    expect(p.hair.sides).not.toBe("");
    expect(p.hair.texture_tips.length).toBeGreaterThan(0);
    expect(p.hair.styling.length).toBeGreaterThan(0);
    expect(p.hair.avoid.length).toBeGreaterThan(0);
    expect(p.hair.barber_instructions).not.toBe("");
    // grooming: barba, cejas
    expect(p.grooming.facial_hair.recommended.length).toBeGreaterThan(0);
    expect(p.grooming.eyebrows.length).toBeGreaterThan(0);
    // ropa: siluetas, cortes de pantalón, largos, layering, evitar
    for (const list of [
      p.clothing.recommended_silhouettes,
      p.clothing.pant_cuts,
      p.clothing.lengths,
      p.clothing.layering,
      p.clothing.avoid,
      p.shoes.avoid,
      p.accessories.jewelry,
      p.accessories.eyewear,
      p.tattoos.placements,
      p.general_advice,
    ])
      expect(list.length).toBeGreaterThan(0);
  });

  it("no tiene campos de puntaje", () => {
    const keys = JSON.stringify(z.toJSONSchema(StyleProfileSchema)).match(/"[a-z_]+":/g) ?? [];
    expect(keys.filter((k) => /score|rating|attractiv|puntaje/.test(k))).toEqual([]);
  });

  it("aplica los límites de cantidad y largo", () => {
    const long = { ...FIXTURE_STYLE_PROFILE.hair, barber_instructions: "x".repeat(401) };
    expect(StyleProfileSchema.safeParse({ ...FIXTURE_STYLE_PROFILE, hair: long }).success).toBe(
      false,
    );
    const many = { ...FIXTURE_STYLE_PROFILE, general_advice: Array.from({ length: 7 }, () => "x") };
    expect(StyleProfileSchema.safeParse(many).success).toBe(false);
    // "no aplica" se expresa con listas y strings vacíos, sin null.
    const empty = {
      ...FIXTURE_STYLE_PROFILE,
      accessories: { ...FIXTURE_STYLE_PROFILE.accessories, eyewear: [] },
      tattoos: { ...FIXTURE_STYLE_PROFILE.tattoos, suggestions: [], placements: [] },
    };
    expect(StyleProfileSchema.safeParse(empty).success).toBe(true);
  });

  it("se parte en núcleo (free) y asesoría (Premium) sin perder datos", () => {
    const { core, advice } = splitStyleProfile(FIXTURE_STYLE_PROFILE);
    expect(Object.keys(core).sort()).toEqual(
      ["appearance", "avoid", "colors", "schema_version", "strengths", "style_direction"].sort(),
    );
    expect(StyleProfileCoreSchema.parse(core)).toEqual(core);
    expect(StyleAdviceSchema.parse(advice)).toEqual(advice);
    expect("appearance" in advice).toBe(false);
    expect(mergeStyleProfile(core, advice)).toEqual(FIXTURE_STYLE_PROFILE);
  });
});

describe("StyleProfile v3: perfil visual sin medidas ni puntajes", () => {
  const withAppearance = (patch: Record<string, unknown>) => ({
    ...FIXTURE_STYLE_PROFILE,
    appearance: { ...FIXTURE_STYLE_PROFILE.appearance, ...patch },
  });

  it("silueta y proporciones son enums cerrados; los rasgos, frases cortas", () => {
    expect(StyleProfileSchema.safeParse(withAppearance({ body_shape: "ATHLETIC" })).success).toBe(
      false,
    );
    expect(StyleProfileSchema.safeParse(withAppearance({ torso_legs: "44/56" })).success).toBe(
      false,
    );
    expect(
      StyleProfileSchema.safeParse(withAppearance({ face_features: ["a", "b", "c"] })).success,
    ).toBe(false);
    expect(
      StyleProfileSchema.safeParse(withAppearance({ face_features: ["x".repeat(61)] })).success,
    ).toBe(false);
    // "no se ve" se dice con UNKNOWN y sin rasgos, nunca con null.
    const unknown = withAppearance({
      face_features: [],
      body_shape: "UNKNOWN",
      torso_legs: "UNKNOWN",
    });
    expect(StyleProfileSchema.safeParse(unknown).success).toBe(true);
    expect(StyleProfileSchema.safeParse(withAppearance({ body_shape: null })).success).toBe(false);
  });

  it("el único número del perfil y de los looks es schema_version (sin medidas ni porcentajes)", () => {
    const profile = JSON.stringify(z.toJSONSchema(StyleProfileSchema));
    expect(profile.match(/"type":"(number|integer)"/g)).toHaveLength(1);
    expect(z.toJSONSchema(StyleProfileSchema).properties?.schema_version).toMatchObject({
      type: "number",
      const: 3,
    });
    expect(JSON.stringify(z.toJSONSchema(LookSpecSchema))).not.toMatch(/"type":"(number|integer)"/);
    for (const schema of [StyleProfileSchema, LookSpecSchema]) {
      const keys = JSON.stringify(z.toJSONSchema(schema)).match(/"[a-z_]+":/g) ?? [];
      expect(
        keys.filter((k) =>
          /score|rating|attractiv|puntaje|percent|porcentaje|ratio|measure|medida|_cm"/.test(k),
        ),
      ).toEqual([]);
    }
  });
});

describe("parseStoredStyleProfile", () => {
  const { core, advice } = splitStyleProfile(FIXTURE_STYLE_PROFILE);

  it("lee v3: núcleo + asesoría", () => {
    expect(parseStoredStyleProfile(core, advice)).toEqual({ profile: core, advice });
  });

  it("sube un perfil v2 guardado a v3: sin rasgos y con silueta y proporciones UNKNOWN", () => {
    const v2Core = { ...core, schema_version: 2, appearance: FIXTURE_STYLE_PROFILE_V2.appearance };
    const stored = parseStoredStyleProfile(v2Core, advice);
    expect(stored?.profile).toEqual({
      ...core,
      appearance: {
        ...FIXTURE_STYLE_PROFILE_V2.appearance,
        face_features: [],
        body_shape: "UNKNOWN",
        torso_legs: "UNKNOWN",
      },
    });
    // La asesoría no cambió entre v2 y v3: se lee tal cual.
    expect(stored?.advice).toEqual(advice);
    expect(StyleProfileCoreSchema.safeParse(stored?.profile).success).toBe(true);
  });

  it("v3 sin asesoría (usuario free o perfil sin fila Premium): advice null", () => {
    expect(parseStoredStyleProfile(core)).toEqual({ profile: core, advice: null });
    expect(parseStoredStyleProfile(core, { basura: true })).toEqual({
      profile: core,
      advice: null,
    });
  });

  it("sube un perfil v1 guardado a v3 con la asesoría nueva vacía", () => {
    const stored = parseStoredStyleProfile(FIXTURE_STYLE_PROFILE_V1);
    expect(stored?.profile.schema_version).toBe(3);
    expect(stored?.profile.appearance).toMatchObject({ body_shape: "UNKNOWN", face_features: [] });
    expect(stored?.profile.style_direction).toEqual(FIXTURE_STYLE_PROFILE_V1.style_direction);
    expect(stored?.profile.colors).toEqual(FIXTURE_STYLE_PROFILE_V1.colors);
    expect(stored?.advice?.hair.recommended_styles).toEqual(
      FIXTURE_STYLE_PROFILE_V1.hair.recommended_styles,
    );
    expect(stored?.advice?.hair.barber_instructions).toBe("");
    expect(stored?.advice?.general_advice).toEqual([]);
    expect(StyleAdviceSchema.safeParse(stored?.advice).success).toBe(true);
  });

  it("devuelve null si profile_json no es un perfil de ninguna versión", () => {
    expect(parseStoredStyleProfile(null)).toBeNull();
    expect(parseStoredStyleProfile({ schema_version: 3 })).toBeNull();
    expect(parseStoredStyleProfile({ ...core, colors: { best: [] } })).toBeNull();
  });
});

describe("StyleProfile y LookSpec rechazan datos inválidos", () => {
  it("colores sin hex válido", () => {
    const bad = {
      ...FIXTURE_STYLE_PROFILE,
      colors: { ...FIXTURE_STYLE_PROFILE.colors, best: [{ name: "rojo", hex: "red" }] },
    };
    expect(StyleProfileSchema.safeParse(bad).success).toBe(false);
  });
  it("listas demasiado largas (evita texto libre desbordado)", () => {
    const bad = { ...FIXTURE_STYLE_PROFILE, strengths: Array.from({ length: 20 }, () => "x") };
    expect(StyleProfileSchema.safeParse(bad).success).toBe(false);
  });
  it("LookSpec exige preservar identidad en el prompt de imagen", () => {
    const [look] = FIXTURE_LOOK_SPECS;
    const bad = {
      ...look,
      image_prompt_data: { ...look.image_prompt_data, preserve_identity: false },
    };
    expect(LookSpecSchema.safeParse(bad).success).toBe(false);
  });
  it("cada razón del look trae aspecto y calificativo (enum cerrado)", () => {
    const [look] = FIXTURE_LOOK_SPECS;
    expect(look.reasoning[0]).toEqual({
      aspect: "COLOR",
      qualifier: "cálido",
      text: "los tonos tierra acompañan el subtono cálido",
    });
    const reason = (r: unknown) => LookSpecSchema.safeParse({ ...look, reasoning: [r] }).success;
    expect(reason({ aspect: "FACE", qualifier: "", text: "acompaña el rostro" })).toBe(true);
    expect(reason({ aspect: "SCORE", qualifier: "", text: "x" })).toBe(false);
    expect(reason({ aspect: "COLOR", qualifier: "x".repeat(31), text: "x" })).toBe(false);
    // La IA tiene que devolver el formato nuevo: texto suelto no valida.
    expect(reason("los tonos tierra acompañan")).toBe(false);
  });
  it("listLookGarments enumera los slots", () => {
    expect(listLookGarments(FIXTURE_LOOK_SPECS[0]).map((g) => g.slot)).toEqual([
      "top",
      "bottom",
      "layering:0",
      "shoes",
      "accessory:0",
    ]);
  });
});

describe("StoredLookSpecSchema: looks guardados", () => {
  const [look] = FIXTURE_LOOK_SPECS;

  it("lee el formato actual tal cual", () => {
    expect(StoredLookSpecSchema.parse(look)).toEqual(look);
  });

  it("lee los looks guardados con razones de texto: pasan a STYLE sin calificativo", () => {
    const legacy = { ...look, reasoning: ["los tonos tierra acompañan", "capas simples"] };
    const parsed = StoredLookSpecSchema.safeParse(JSON.parse(JSON.stringify(legacy)));
    expect(parsed.success).toBe(true);
    expect(parsed.data?.reasoning).toEqual([
      { aspect: "STYLE", qualifier: "", text: "los tonos tierra acompañan" },
      { aspect: "STYLE", qualifier: "", text: "capas simples" },
    ]);
    // El resultado es un LookSpec válido (lo usan el worker y la UI).
    expect(LookSpecSchema.safeParse(parsed.data).success).toBe(true);
    expect(StoredLookSpecSchema.safeParse({ ...look, reasoning: [] }).success).toBe(true);
  });

  it("sigue rechazando un look roto", () => {
    expect(StoredLookSpecSchema.safeParse({ ...look, top: null }).success).toBe(false);
    expect(StoredLookSpecSchema.safeParse(null).success).toBe(false);
  });
});

describe("otros schemas", () => {
  it("PhotoValidationResult", () => {
    expect(
      PhotoValidationResultSchema.safeParse({
        photo_id: UUID,
        type: "FACE_DETAIL",
        valid: true,
        issues: [],
        quality_score: 0.9,
      }).success,
    ).toBe(true);
    expect(
      PhotoValidationResultSchema.safeParse({
        photo_id: UUID,
        type: "SELFIE",
        valid: true,
        issues: [],
        quality_score: 2,
      }).success,
    ).toBe(false);
  });
  it("ShoppingQuery solo para Uruguay", () => {
    const base = {
      garment: FIXTURE_LOOK_SPECS[0].top,
      country_code: "UY",
      size: null,
      max_price: null,
      limit: 5,
    };
    expect(ShoppingQuerySchema.safeParse(base).success).toBe(true);
    expect(ShoppingQuerySchema.safeParse({ ...base, country_code: "AR" }).success).toBe(false);
  });
  it("Cart coincide con cart_items: cantidades, look con prenda y fechas de la base", () => {
    const item = {
      id: UUID,
      cart_id: UUID,
      product_id: UUID,
      variant_id: null,
      look_id: UUID,
      garment_slot: "top",
      quantity: 1,
      price_amount_snapshot: 1399,
      currency_snapshot: "UYU",
      purchased_at: null,
      // PostgREST devuelve microsegundos y offset.
      created_at: "2026-10-01T12:00:00.123456+00:00",
      updated_at: "2026-10-01T12:00:00.123456+00:00",
    };
    const cart = (items: unknown[]) => CartSchema.safeParse({ id: UUID, user_id: UUID, items });
    expect(cart([item]).success).toBe(true);
    expect(cart([{ ...item, quantity: 11 }]).success).toBe(false);
    expect(cart([{ ...item, garment_slot: null }]).success).toBe(false);
    expect(cart([{ ...item, look_id: null, garment_slot: null }]).success).toBe(true);
    expect(cart([{ ...item, look_id: null }]).success).toBe(true);
    expect(cart([{ ...item, garment_slot: "sombrero" }]).success).toBe(false);
    expect(cart([{ ...item, currency_snapshot: "ARS" }]).success).toBe(false);
  });
  it("JobTypes tienen schema de payload", () => {
    for (const type of JobTypeSchema.options) expect(JobPayloadSchemas[type]).toBeDefined();
    expect(JobPayloadSchemas.GENERATE_LOOK.safeParse({ user_id: UUID, look_id: "x" }).success).toBe(
      false,
    );
  });
  it("SubscriptionStatus", () => {
    expect(SubscriptionStatusSchema.options).toEqual([
      "FREE",
      "PENDING",
      "ACTIVE",
      "PAST_DUE",
      "CANCELLED",
      "EXPIRED",
    ]);
  });
  it("analytics: solo nombres conocidos y propiedades planas", () => {
    expect(
      AnalyticsEventSchema.safeParse({
        name: "landing_view",
        user_id: null,
        anonymous_id: null,
        path: "/",
        properties: {},
      }).success,
    ).toBe(true);
    expect(
      AnalyticsEventSchema.safeParse({
        name: "drop_table",
        user_id: null,
        anonymous_id: null,
        path: "/",
        properties: {},
      }).success,
    ).toBe(false);
    expect(ClientAnalyticsEventSchema.safeParse({ name: "subscription_started" }).success).toBe(
      false,
    );
  });
  it("analytics: carrito y guardados salen solo del servidor (D20)", () => {
    for (const name of [
      "product_added_to_cart",
      "product_removed_from_cart",
      "look_saved",
      "product_saved",
    ]) {
      expect(AnalyticsEventSchema.shape.name.safeParse(name).success).toBe(true);
      expect(ClientAnalyticsEventSchema.safeParse({ name }).success).toBe(false);
    }
  });
});

describe("reglas de dominio", () => {
  it("isPremiumSubscription", () => {
    const now = new Date("2026-06-01T00:00:00Z");
    expect(isPremiumSubscription(null, now)).toBe(false);
    expect(
      isPremiumSubscription({ status: "ACTIVE", current_period_end: "2026-07-01T00:00:00Z" }, now),
    ).toBe(true);
    expect(
      isPremiumSubscription(
        { status: "CANCELLED", current_period_end: "2026-06-02T00:00:00Z" },
        now,
      ),
    ).toBe(true);
    expect(
      isPremiumSubscription({ status: "ACTIVE", current_period_end: "2026-05-01T00:00:00Z" }, now),
    ).toBe(false);
    expect(
      isPremiumSubscription(
        { status: "PAST_DUE", current_period_end: "2026-07-01T00:00:00Z" },
        now,
      ),
    ).toBe(false);
    expect(isPremiumSubscription({ status: "PENDING", current_period_end: null }, now)).toBe(false);
  });
  it("computeRetryDelaySeconds: backoff exponencial con tope", () => {
    expect([1, 2, 3, 4].map((a) => computeRetryDelaySeconds(a))).toEqual([30, 60, 120, 240]);
    expect(computeRetryDelaySeconds(50)).toBe(3600);
  });
});

describe("validación de archivos de foto", () => {
  it("detecta el tipo real por magic bytes", () => {
    expect(sniffImageMimeType(PNG)).toBe("image/png");
    expect(sniffImageMimeType(JPEG)).toBe("image/jpeg");
    expect(sniffImageMimeType(WEBP)).toBe("image/webp");
    expect(sniffImageMimeType(new TextEncoder().encode("<svg></svg>"))).toBeNull();
  });
  it("rechaza tamaño, extensión, MIME o contenido inválidos", () => {
    const ok = { name: "foto.PNG", size: 1000, declaredType: "image/png", head: PNG };
    expect(checkPhotoFile(ok)).toEqual({ ok: true, mimeType: "image/png", extension: "png" });
    expect(checkPhotoFile({ ...ok, size: 0 })).toMatchObject({ reason: "EMPTY" });
    expect(checkPhotoFile({ ...ok, size: 11 * 1024 * 1024 })).toMatchObject({
      reason: "TOO_LARGE",
    });
    expect(checkPhotoFile({ ...ok, name: "foto.gif" })).toMatchObject({ reason: "BAD_EXTENSION" });
    expect(checkPhotoFile({ ...ok, declaredType: "image/svg+xml" })).toMatchObject({
      reason: "BAD_TYPE",
    });
    expect(checkPhotoFile({ ...ok, declaredType: "image/jpeg", name: "x.jpg" })).toMatchObject({
      reason: "TYPE_MISMATCH",
    });
    expect(checkPhotoFile({ ...ok, head: new TextEncoder().encode("not an image") })).toMatchObject(
      { reason: "BAD_TYPE" },
    );
  });
});
