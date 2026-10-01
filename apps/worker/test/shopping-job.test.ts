import type { RankedProduct, ShoppingProgress, ShoppingResult } from "@asesor/shared";
import { FIXTURE_PRODUCTS } from "@asesor/shared/fixtures";
import { describe, expect, it } from "vitest";

import { createStageTracker, type SlotOutcome, summarizeSearch } from "../src/handlers/shopping";

const at = () => new Date("2026-10-01T12:00:00.000Z");

function recorder() {
  const reports: ShoppingProgress[] = [];
  return { reports, report: async (p: ShoppingProgress) => void reports.push(p) };
}

describe("createStageTracker", () => {
  it("la etapa del job es la de la prenda más atrasada: avanza en orden y nunca retrocede", async () => {
    const { reports, report } = recorder();
    const tracker = createStageTracker(2, report, at);
    tracker.advance(0, "SEARCHING");
    tracker.advance(0, "CHECKING_STORES");
    tracker.advance(0, "COMPARING");
    // La prenda 1 sigue buscando: el job todavía está en SEARCHING.
    tracker.advance(1, "CHECKING_STORES");
    tracker.advance(0, "VERIFYING");
    tracker.advance(0, "SEARCHING"); // no retrocede
    tracker.advance(1, "COMPARING");
    tracker.advance(1, "VERIFYING");
    tracker.finish(0);
    tracker.advance(1, "RANKING");
    tracker.finish(1);
    await tracker.complete({
      mode: "LOOK",
      slots: 2,
      slots_with_results: 2,
      failed_slots: [],
      candidates: 10,
      products: 8,
      saved: 8,
      unverified_stock: 0,
      unverified_sizes: 1,
      partial: false,
      cache_hits: 0,
    });

    expect(reports.map((r) => `${r.stage} ${r.slots_done}/${r.slots_total}`)).toEqual([
      "SEARCHING 0/2",
      "CHECKING_STORES 0/2",
      "COMPARING 0/2",
      "VERIFYING 0/2",
      "VERIFYING 1/2",
      "RANKING 1/2",
      "RANKING 2/2",
      "RANKING 2/2",
    ]);
    // Sin porcentajes: solo etapa, conteos reales y, al final, el resumen.
    expect(Object.keys(reports[0]!).sort()).toEqual(
      ["slots_done", "slots_total", "stage", "summary", "updated_at"].sort(),
    );
    expect(reports.at(-1)?.summary).toMatchObject({ partial: false, unverified_sizes: 1 });
    expect(reports.slice(0, -1).every((r) => r.summary === null)).toBe(true);
  });

  it("guarda los progresos en orden aunque el guardado tarde, y una falla no corta la cadena", async () => {
    const saved: string[] = [];
    let calls = 0;
    const tracker = createStageTracker(1, async (p) => {
      calls++;
      if (calls === 2) throw new Error("base caída");
      await new Promise((r) => setTimeout(r, calls === 1 ? 20 : 0));
      saved.push(p.stage);
    });
    tracker.advance(0, "CHECKING_STORES");
    tracker.advance(0, "COMPARING");
    tracker.finish(0);
    await tracker.complete({
      mode: "SLOT",
      slots: 1,
      slots_with_results: 1,
      failed_slots: [],
      candidates: 1,
      products: 1,
      saved: 1,
      unverified_stock: 0,
      unverified_sizes: 0,
      partial: false,
      cache_hits: 1,
    });
    expect(saved).toEqual(["SEARCHING", "COMPARING", "RANKING", "RANKING"]);
  });
});

function result(items: RankedProduct[], source: ShoppingResult["source"] = "LIVE"): ShoppingResult {
  return {
    query: {} as ShoppingResult["query"],
    items,
    source,
    generated_at: at().toISOString(),
    stats: {
      candidates: 6,
      products: items.length + 1,
      blocked: 1,
      gone: 0,
      failed: 0,
      not_product: 0,
      no_price: 0,
      invalid: 0,
      unverified_stock: 0,
      unverified_sizes: 0,
    },
  };
}

const ranked = (i: number, overrides: Partial<RankedProduct> = {}): RankedProduct => ({
  product: FIXTURE_PRODUCTS[i]!,
  score: 0.8,
  breakdown: {
    category_match: 1,
    visual_similarity: 0.8,
    color_match: 1,
    fit_match: 1,
    material_match: 0.5,
    size_available: 1,
    stock: 1,
    price: 0.5,
  },
  size_status: "AVAILABLE",
  ...overrides,
});

describe("summarizeSearch", () => {
  it("cuenta prendas con resultados, fallidas, sin verificar y marca la búsqueda como parcial", () => {
    const outcomes: SlotOutcome[] = [
      {
        slot: "top",
        ok: true,
        result: result([ranked(0), ranked(1, { size_status: "UNVERIFIED" })]),
        saved: 2,
      },
      // Desert boots con stock UNKNOWN en el fixture.
      { slot: "shoes", ok: true, result: result([ranked(4)], "CACHE"), saved: 1 },
      { slot: "bottom", ok: true, result: result([]), saved: 0 },
      { slot: "accessory:0", ok: false, error: new Error("tienda caída") },
    ];
    expect(summarizeSearch("LOOK", outcomes)).toEqual({
      mode: "LOOK",
      slots: 4,
      slots_with_results: 2,
      failed_slots: ["accessory:0"],
      candidates: 18,
      products: 6,
      saved: 3,
      unverified_stock: 1,
      unverified_sizes: 1,
      partial: true,
      cache_hits: 1,
    });
  });

  it("sin fallas ni prendas vacías no es parcial", () => {
    const summary = summarizeSearch("SLOT", [
      { slot: "top", ok: true, result: result([ranked(0)]), saved: 1 },
    ]);
    expect(summary).toMatchObject({ partial: false, slots_with_results: 1, failed_slots: [] });
  });
});
