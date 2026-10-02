import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `/api/analytics` (paso 11, D20): el navegador solo puede reportar vistas y clicks de la lista
 * blanca, con propiedades planas; el usuario sale de la sesión, nunca del pedido. Los eventos
 * de shopping, carrito y guardados se rechazan: solo los emite el servidor.
 */

const trackEvent = vi.hoisted(() => vi.fn());
const session = vi.hoisted(() => ({ user: null as { id: string } | null }));

vi.mock("@/lib/analytics", () => ({ getAnalytics: () => ({ trackEvent }) }));
vi.mock("@/lib/auth", () => ({ getSessionUser: async () => session.user }));

const { POST } = await import("./route");

const USER = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
let ip = 0;
const post = (body: unknown) =>
  POST(
    new NextRequest("http://localhost:3000/api/analytics", {
      method: "POST",
      body: typeof body === "string" ? body : JSON.stringify(body),
      // Una IP por pedido: el rate limit por IP no interfiere entre tests.
      headers: { "x-forwarded-for": `10.0.0.${++ip}` },
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  session.user = USER;
});

describe("POST /api/analytics", () => {
  it("acepta una vista de la lista blanca y toma el usuario de la sesión", async () => {
    const res = await post({
      name: "product_viewed",
      user_id: "ffffffff-ffff-4fff-8fff-ffffffffffff",
      path: "/app/looks/x",
      properties: { product_id: "p", store_domain: "tienda.com.uy", rank: 1, slot: null },
    });
    expect(res.status).toBe(204);
    expect(trackEvent).toHaveBeenCalledWith("product_viewed", {
      userId: USER.id,
      anonymousId: null,
      path: "/app/looks/x",
      properties: { product_id: "p", store_domain: "tienda.com.uy", rank: 1, slot: null },
    });
  });

  it.each([
    "shopping_started",
    "shopping_completed",
    "cheaper_alternative_requested",
    "product_added_to_cart",
    "product_removed_from_cart",
    "look_saved",
    "product_saved",
    "subscription_started",
  ])("rechaza %s: solo lo emite el servidor", async (name) => {
    expect((await post({ name, properties: {} })).status).toBe(400);
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it("rechaza propiedades anidadas o demasiado largas (no las descarta en silencio)", async () => {
    expect(
      (await post({ name: "product_viewed", properties: { product: { id: "p" } } })).status,
    ).toBe(400);
    expect(
      (await post({ name: "product_viewed", properties: { store: "x".repeat(201) } })).status,
    ).toBe(400);
    expect((await post("{no es json")).status).toBe(400);
    expect(
      (await post({ name: "product_viewed", properties: { x: "y".repeat(5000) } })).status,
    ).toBe(413);
    expect(trackEvent).not.toHaveBeenCalled();
  });
});
