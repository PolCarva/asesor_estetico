import { describe, expect, it } from "vitest";

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
} from "../src";
import { FIXTURE_LOOK_SPECS, FIXTURE_PRODUCTS, FIXTURE_STYLE_PROFILE } from "../src/fixtures";

const UUID = "0b5a1c3e-8f5d-4c1b-9d2e-1a2b3c4d5e6f";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const WEBP = new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 ");

describe("fixtures cumplen los schemas", () => {
  it("StyleProfile", () => {
    expect(StyleProfileSchema.parse(FIXTURE_STYLE_PROFILE)).toEqual(FIXTURE_STYLE_PROFILE);
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
  it("Cart limita cantidades", () => {
    const item = {
      id: UUID,
      product_id: UUID,
      variant_id: null,
      quantity: 11,
      price_snapshot: { amount: 1, currency: "UYU" },
      added_at: "2026-01-01T00:00:00Z",
    };
    expect(CartSchema.safeParse({ id: UUID, user_id: UUID, items: [item] }).success).toBe(false);
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
