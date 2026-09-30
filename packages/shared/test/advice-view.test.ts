import { describe, expect, it } from "vitest";

import {
  ADVICE_SECTION_IDS,
  ClientAnalyticsEventSchema,
  FREE_TEASER_LIMITS,
  parseStoredStyleProfile,
  selectAdviceForPlan,
  splitStyleProfile,
} from "../src";
import { FIXTURE_STYLE_PROFILE, FIXTURE_STYLE_PROFILE_V1 } from "../src/fixtures";

const { core, advice } = splitStyleProfile(FIXTURE_STYLE_PROFILE);

describe("selectAdviceForPlan", () => {
  it("free: solo el teaser recortado y todas las secciones bloqueadas", () => {
    const view = selectAdviceForPlan(core, advice, false);
    expect(view.plan).toBe("FREE");
    expect(view.favors.length).toBeLessThanOrEqual(FREE_TEASER_LIMITS.favors);
    expect(view.avoid.length).toBeLessThanOrEqual(FREE_TEASER_LIMITS.avoid);
    expect(view.colors.best.length).toBeLessThanOrEqual(FREE_TEASER_LIMITS.bestColors);
    expect(view.sections).toEqual([]);
    expect(view.locked.map((s) => s.id)).toEqual([...ADVICE_SECTION_IDS]);
  });

  it("free: ningún texto de la asesoría Premium entra en el view model", () => {
    const serialized = JSON.stringify(selectAdviceForPlan(core, advice, false));
    const premiumTexts = [
      advice.hair.barber_instructions,
      ...advice.general_advice,
      ...advice.shoes.recommended,
      ...advice.grooming.eyebrows,
    ].filter(Boolean);
    expect(premiumTexts.length).toBeGreaterThan(0);
    for (const text of premiumTexts) expect(serialized).not.toContain(text);
  });

  it("free con perfil v1: ignora la asesoría legada que viene de profile_json", () => {
    const stored = parseStoredStyleProfile(FIXTURE_STYLE_PROFILE_V1);
    expect(stored?.advice).not.toBeNull();
    const view = selectAdviceForPlan(stored!.profile, stored!.advice, false);
    expect(view.sections).toEqual([]);
    expect(JSON.stringify(view)).not.toContain(FIXTURE_STYLE_PROFILE_V1.shoes.recommended[0]);
  });

  it("Premium: todo el núcleo y todas las secciones con contenido", () => {
    const view = selectAdviceForPlan(core, advice, true);
    expect(view.plan).toBe("PREMIUM");
    expect(view.favors).toEqual(core.strengths);
    expect(view.colors).toEqual(core.colors);
    expect(view.locked).toEqual([]);
    expect(view.pendingNextAnalysis).toBe(false);
    const ids = view.sections.map((s) => s.id);
    for (const id of ["hair", "grooming", "clothing", "shoes_accessories", "general"] as const)
      expect(ids).toContain(id);
    const hair = view.sections.find((s) => s.id === "hair");
    expect(hair?.highlight?.text).toBe(advice.hair.barber_instructions);
    // Ningún grupo vacío.
    for (const s of view.sections)
      for (const g of s.groups) expect(g.items.length).toBeGreaterThan(0);
  });

  it("Premium: cada ítem de la asesoría aparece en alguna sección", () => {
    const view = selectAdviceForPlan(core, advice, true);
    const shown = new Set(view.sections.flatMap((s) => s.groups.flatMap((g) => g.items)));
    const expected = [
      ...advice.hair.recommended_styles,
      ...advice.hair.texture_tips,
      ...advice.hair.styling,
      ...advice.hair.avoid,
      ...advice.grooming.facial_hair.recommended,
      ...advice.grooming.facial_hair.avoid,
      ...advice.grooming.eyebrows,
      ...advice.grooming.recommendations,
      ...advice.grooming.avoid,
      ...advice.clothing.recommended_categories,
      ...advice.clothing.recommended_silhouettes,
      ...advice.clothing.pant_cuts,
      ...advice.clothing.lengths,
      ...advice.clothing.layering,
      ...advice.clothing.avoid,
      ...advice.fits.recommended,
      ...advice.fits.avoid,
      ...advice.materials.recommended,
      ...advice.materials.avoid,
      ...advice.body_proportions.balance_notes,
      ...advice.shoes.recommended,
      ...advice.shoes.avoid,
      ...advice.accessories.recommended,
      ...advice.accessories.jewelry,
      ...advice.accessories.eyewear,
      ...advice.accessories.avoid,
      ...advice.tattoos.suggestions,
      ...advice.tattoos.placements,
      ...advice.general_advice,
    ];
    for (const item of expected) expect(shown).toContain(item);
  });

  it("Premium con perfil v1 o sin asesoría: marca pendiente", () => {
    const stored = parseStoredStyleProfile(FIXTURE_STYLE_PROFILE_V1);
    expect(selectAdviceForPlan(stored!.profile, stored!.advice, true).pendingNextAnalysis).toBe(
      true,
    );
    const none = selectAdviceForPlan(core, null, true);
    expect(none.pendingNextAnalysis).toBe(true);
    expect(none.sections).toEqual([]);
  });
});

describe("style_advice_viewed", () => {
  it("es un evento que el cliente puede reportar", () => {
    const event = ClientAnalyticsEventSchema.parse({
      name: "style_advice_viewed",
      properties: { plan: "FREE", sections_visible: 0 },
    });
    expect(event.name).toBe("style_advice_viewed");
  });
});
