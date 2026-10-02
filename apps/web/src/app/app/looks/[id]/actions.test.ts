import { AppError, EMPTY_USER_SIZES } from "@asesor/shared";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { rateLimiters } from "@/lib/rate-limit";

/**
 * Actions del shopping del look (pasos 06–09): Premium en el servidor (paywall sin tocar la
 * lógica), rate limit por usuario, eventos desde el servidor y mensajes sin detalles técnicos.
 */

const db = vi.hoisted(() => ({
  requirePremium: vi.fn(),
  getUserSizes: vi.fn(),
  saveUserSizes: vi.fn(),
  startLookShopping: vi.fn(),
  startCheaperSearch: vi.fn(),
}));
const trackEvent = vi.hoisted(() => vi.fn());

vi.mock("@asesor/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@asesor/db")>()),
  ...db,
}));
vi.mock("@asesor/db/server", () => ({ createServerSupabaseClient: async () => ({}) }));
vi.mock("@asesor/db/service", () => ({ getServiceRoleClient: () => ({}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/analytics", () => ({ getAnalytics: () => ({ trackEvent }) }));

const { findCheaperAlternativeAction, startLookShoppingAction } = await import("./actions");

const USER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LOOK = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const PRODUCT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const JOB = "dddddddd-dddd-4ddd-8ddd-dddddddddddd";

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
};
const limited = { allowed: false, remaining: 0, resetAt: Date.now() + 60_000 };

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
  db.requirePremium.mockResolvedValue({ id: USER });
  db.getUserSizes.mockResolvedValue({ ...EMPTY_USER_SIZES, top: "M" });
});

describe("startLookShoppingAction", () => {
  it("free: paywall sin encolar ni emitir eventos", async () => {
    db.requirePremium.mockRejectedValue(new AppError("PREMIUM_REQUIRED", "Premium."));
    expect(await startLookShoppingAction({ status: "idle" }, form({ lookId: LOOK }))).toEqual({
      status: "paywall",
    });
    expect(db.startLookShopping).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("encola y emite shopping_started desde el servidor una sola vez", async () => {
    db.startLookShopping.mockResolvedValue({ jobId: JOB, alreadyRunning: false, mode: "LOOK" });
    expect(await startLookShoppingAction({ status: "idle" }, form({ lookId: LOOK }))).toEqual({
      status: "queued",
      jobId: JOB,
    });
    expect(trackEvent).toHaveBeenCalledWith("shopping_started", {
      userId: USER,
      path: `/app/looks/${LOOK}`,
      properties: { look_id: LOOK, mode: "LOOK" },
    });

    trackEvent.mockClear();
    db.startLookShopping.mockResolvedValue({ jobId: JOB, alreadyRunning: true, mode: "LOOK" });
    await startLookShoppingAction({ status: "idle" }, form({ lookId: LOOK }));
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("rate limit `shoppingSearch` (10 por hora por usuario): no encola y lo dice", async () => {
    const consume = vi.spyOn(rateLimiters.shoppingSearch, "consume").mockResolvedValueOnce(limited);
    expect(await startLookShoppingAction({ status: "idle" }, form({ lookId: LOOK }))).toEqual({
      status: "error",
      error: "Hiciste muchas búsquedas seguidas. Probá de nuevo en un rato.",
    });
    expect(consume).toHaveBeenCalledWith(USER);
    expect(db.startLookShopping).not.toHaveBeenCalled();
  });

  it("un error técnico nunca llega a la UI", async () => {
    db.startLookShopping.mockRejectedValue(new Error('relation "jobs" violates constraint'));
    expect(await startLookShoppingAction({ status: "idle" }, form({ lookId: LOOK }))).toEqual({
      status: "error",
      error: "No pudimos iniciar la búsqueda. Probá de nuevo.",
    });
  });
});

describe("findCheaperAlternativeAction", () => {
  const fields = { lookId: LOOK, productId: PRODUCT };

  it("free: paywall sin encolar", async () => {
    db.requirePremium.mockRejectedValue(new AppError("PREMIUM_REQUIRED", "Premium."));
    expect(await findCheaperAlternativeAction({ status: "idle" }, form(fields))).toEqual({
      status: "paywall",
    });
    expect(db.startCheaperSearch).not.toHaveBeenCalled();
  });

  it("emite cheaper_alternative_requested desde el servidor con el precio de referencia", async () => {
    db.startCheaperSearch.mockResolvedValue({
      jobId: JOB,
      alreadyRunning: false,
      mode: "SLOT",
      slot: "top",
      price: { amount: 1399, currency: "UYU" },
    });
    expect(await findCheaperAlternativeAction({ status: "idle" }, form(fields))).toEqual({
      status: "queued",
    });
    expect(trackEvent).toHaveBeenCalledWith("cheaper_alternative_requested", {
      userId: USER,
      path: `/app/looks/${LOOK}`,
      properties: {
        look_id: LOOK,
        slot: "top",
        product_id: PRODUCT,
        price: 1399,
        currency: "UYU",
      },
    });
  });

  it("rate limit `cheaperSearch` (20 por hora por usuario): no encola y lo dice", async () => {
    const consume = vi.spyOn(rateLimiters.cheaperSearch, "consume").mockResolvedValueOnce(limited);
    expect(await findCheaperAlternativeAction({ status: "idle" }, form(fields))).toEqual({
      status: "error",
      error: "Pediste muchas búsquedas seguidas. Probá de nuevo en un rato.",
    });
    expect(consume).toHaveBeenCalledWith(USER);
    expect(db.startCheaperSearch).not.toHaveBeenCalled();
  });

  it("sin precio publicado: mensaje humano", async () => {
    db.startCheaperSearch.mockRejectedValue(new AppError("VALIDATION_FAILED", "NO_PRICE"));
    expect(await findCheaperAlternativeAction({ status: "idle" }, form(fields))).toEqual({
      status: "error",
      error: "Este producto no tiene precio publicado: no se puede buscar más barato.",
    });
  });
});
