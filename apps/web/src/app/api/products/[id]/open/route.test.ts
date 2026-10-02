import { beforeEach, describe, expect, it, vi } from "vitest";

import { rateLimiters } from "@/lib/rate-limit";

/**
 * "Comprar ↗" (pasos 08 y 11): exige sesión, redirige solo a la URL guardada del producto (sin
 * open redirect), revalida datos viejos solo para Premium y tiene rate limit por usuario.
 */

const db = vi.hoisted(() => ({
  getProductById: vi.fn(),
  getPremiumSubscription: vi.fn(),
  enqueueProductRefresh: vi.fn(),
}));
const session = vi.hoisted(() => ({ user: null as { id: string } | null }));

vi.mock("@asesor/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@asesor/db")>()),
  ...db,
}));
vi.mock("@asesor/db/server", () => ({ createServerSupabaseClient: async () => ({}) }));
vi.mock("@asesor/db/service", () => ({ getServiceRoleClient: () => ({}) }));
vi.mock("@/lib/auth", () => ({ getSessionUser: async () => session.user }));

const { GET } = await import("./route");

const USER = { id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
const PRODUCT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const STORE_URL = "https://www.tienda.com.uy/catalogo/camisa_1";
const open = (id = PRODUCT, query = "") =>
  GET(new Request(`http://localhost:3000/api/products/${id}/open${query}`), {
    params: Promise.resolve({ id }),
  });
const stored = (hoursAgo: number, url = STORE_URL) => ({
  id: PRODUCT,
  product: { url, fetched_at: new Date(Date.now() - hoursAgo * 3_600_000).toISOString() },
});

beforeEach(() => {
  vi.clearAllMocks();
  session.user = USER;
  db.enqueueProductRefresh.mockResolvedValue({});
});

describe("GET /api/products/[id]/open", () => {
  it("sin sesión va al login", async () => {
    session.user = null;
    const res = await open();
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe("http://localhost:3000/login");
  });

  it("redirige a la URL guardada del producto e ignora cualquier destino del pedido", async () => {
    db.getProductById.mockResolvedValue(stored(1));
    const res = await open(PRODUCT, "?url=https://evil.example/&next=//evil.example");
    expect(res.status).toBe(303);
    expect(res.headers.get("location")).toBe(STORE_URL);
    expect(db.enqueueProductRefresh).not.toHaveBeenCalled();
  });

  it("id inválido, producto inexistente o URL que no es http(s): 404", async () => {
    expect((await open("../../etc")).status).toBe(404);
    db.getProductById.mockResolvedValue(null);
    expect((await open()).status).toBe(404);
    db.getProductById.mockResolvedValue(stored(1, "javascript:alert(1)"));
    expect((await open()).status).toBe(404);
  });

  it("dato de más de 8 h: revalida solo para Premium", async () => {
    db.getProductById.mockResolvedValue(stored(10));
    db.getPremiumSubscription.mockResolvedValue(null);
    expect((await open()).status).toBe(303);
    expect(db.enqueueProductRefresh).not.toHaveBeenCalled();

    db.getPremiumSubscription.mockResolvedValue({ status: "ACTIVE" });
    expect((await open()).status).toBe(303);
    expect(db.enqueueProductRefresh).toHaveBeenCalledWith(expect.anything(), PRODUCT);
  });

  it("rate limit `productOpen` por usuario: 429 sin redirigir", async () => {
    const consume = vi
      .spyOn(rateLimiters.productOpen, "consume")
      .mockResolvedValueOnce({ allowed: false, remaining: 0, resetAt: Date.now() + 60_000 });
    const res = await open();
    expect(consume).toHaveBeenCalledWith(USER.id);
    expect(res.status).toBe(429);
    expect(db.getProductById).not.toHaveBeenCalled();
  });
});
