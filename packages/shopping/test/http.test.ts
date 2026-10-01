import { describe, expect, it } from "vitest";

import {
  classifyFetchError,
  type FetchLike,
  HttpProductFetcher,
  NotHtmlError,
  PoliteHttpClient,
  ResponseTooLargeError,
  RobotsDisallowedError,
  TooManyRedirectsError,
  UnsafeUrlError,
} from "../src";

type Route = {
  status?: number;
  body?: string | ReadableStream<Uint8Array>;
  headers?: Record<string, string>;
};

/** Transporte falso por URL exacta; registra cada request. */
function transport(routes: Record<string, Route | (() => Route)>) {
  const calls: string[] = [];
  const fetch: FetchLike = async (url) => {
    calls.push(url);
    const entry = routes[url];
    const route = typeof entry === "function" ? entry() : entry;
    if (!route) return new Response("not found", { status: 404 });
    return new Response(route.body ?? "", { status: route.status ?? 200, headers: route.headers });
  };
  return { fetch, calls };
}

const fast = { minIntervalMs: 0 };

describe("PoliteHttpClient: redirects revalidados", () => {
  it("rechaza un redirect a la IP de metadata de la nube", async () => {
    const { fetch, calls } = transport({
      "https://tienda.com.uy/p/1": {
        status: 302,
        headers: { location: "http://169.254.169.254/latest/meta-data/" },
      },
    });
    const http = new PoliteHttpClient({ fetch, ...fast });
    await expect(http.get("https://tienda.com.uy/p/1")).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(calls).not.toContain("http://169.254.169.254/latest/meta-data/");
  });

  it("rechaza un redirect a localhost. (con punto final) y a CGNAT", async () => {
    const { fetch } = transport({
      "https://tienda.com.uy/a": { status: 301, headers: { location: "http://localhost./admin" } },
      "https://tienda.com.uy/b": { status: 307, headers: { location: "http://100.64.0.1/" } },
    });
    const http = new PoliteHttpClient({ fetch, ...fast });
    await expect(http.get("https://tienda.com.uy/a")).rejects.toBeInstanceOf(UnsafeUrlError);
    await expect(http.get("https://tienda.com.uy/b")).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("sigue redirects válidos (relativos y entre dominios) y consulta el robots del destino", async () => {
    const { fetch, calls } = transport({
      "https://hering.com.uy/p/1": {
        status: 301,
        headers: { location: "https://www.hering.com.uy/p/1" },
      },
      "https://www.hering.com.uy/p/1": { status: 302, headers: { location: "/catalogo/p-1" } },
      "https://www.hering.com.uy/catalogo/p-1": { body: "<html>ok</html>" },
      "https://otra.com.uy/robots.txt": { body: "User-agent: *\nDisallow: /privado" },
      "https://tienda.com.uy/x": {
        status: 302,
        headers: { location: "https://otra.com.uy/privado/x" },
      },
    });
    const http = new PoliteHttpClient({ fetch, ...fast });
    const res = await http.get("https://hering.com.uy/p/1");
    expect(res.url).toBe("https://www.hering.com.uy/catalogo/p-1");
    expect(res.body).toBe("<html>ok</html>");
    expect(calls).toContain("https://www.hering.com.uy/robots.txt");

    await expect(http.get("https://tienda.com.uy/x")).rejects.toBeInstanceOf(RobotsDisallowedError);
    expect(calls).not.toContain("https://otra.com.uy/privado/x");
  });

  it("corta los bucles de redirects", async () => {
    const { fetch } = transport({
      "https://tienda.com.uy/a": { status: 302, headers: { location: "/b" } },
      "https://tienda.com.uy/b": { status: 302, headers: { location: "/a" } },
    });
    const http = new PoliteHttpClient({ fetch, ...fast, maxRedirects: 3 });
    await expect(http.get("https://tienda.com.uy/a")).rejects.toBeInstanceOf(TooManyRedirectsError);
  });
});

describe("PoliteHttpClient: tamaño y tiempo", () => {
  it("corta por content-length declarado sin leer el cuerpo", async () => {
    const { fetch } = transport({
      "https://tienda.com.uy/grande": { body: "x", headers: { "content-length": "999999" } },
    });
    const http = new PoliteHttpClient({ fetch, ...fast, maxBytes: 1000 });
    await expect(http.get("https://tienda.com.uy/grande")).rejects.toBeInstanceOf(
      ResponseTooLargeError,
    );
  });

  it("corta un cuerpo sin content-length apenas pasa el tope (no lo baja entero)", async () => {
    let pulled = 0;
    let cancelled = false;
    const chunk = new Uint8Array(400).fill(65);
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++;
        controller.enqueue(chunk);
        if (pulled > 1000) controller.close();
      },
      cancel() {
        cancelled = true;
      },
    });
    const { fetch } = transport({ "https://tienda.com.uy/infinita": { body: stream } });
    const http = new PoliteHttpClient({ fetch, ...fast, maxBytes: 1000 });
    const error = await http.get("https://tienda.com.uy/infinita").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ResponseTooLargeError);
    expect(classifyFetchError(error)).toBe("too_large");
    expect(cancelled).toBe(true);
    expect(pulled).toBeLessThan(10);
  });

  it("timeout: una tienda que no responde se aborta", async () => {
    const hang: FetchLike = (url, init) =>
      url.endsWith("robots.txt")
        ? Promise.resolve(new Response("", { status: 404 }))
        : new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
          });
    const http = new PoliteHttpClient({ fetch: hang, ...fast, timeoutMs: 50 });
    const error = await http.get("https://lenta.com.uy/p").catch((e: unknown) => e);
    expect(classifyFetchError(error)).toBe("timeout");
  });

  it("respeta el AbortSignal de quien llama", async () => {
    let received: AbortSignal | undefined;
    const fetch: FetchLike = (url, init) => {
      received = init.signal ?? undefined;
      return url.endsWith("robots.txt")
        ? Promise.resolve(new Response("", { status: 404 }))
        : new Promise((_resolve, reject) => {
            init.signal?.addEventListener("abort", () => reject(init.signal?.reason));
          });
    };
    const http = new PoliteHttpClient({ fetch, ...fast });
    const controller = new AbortController();
    const pending = http.get("https://tienda.com.uy/p", { signal: controller.signal });
    setTimeout(() => controller.abort(), 10);
    await expect(pending).rejects.toThrow();
    expect(received?.aborted).toBe(true);
  });
});

describe("PoliteHttpClient: ritmo y concurrencia por dominio", () => {
  it("separa los requests al mismo dominio y no frena a los demás", async () => {
    let clock = 1_000;
    const at: string[] = [];
    const fetch: FetchLike = async (url) => {
      at.push(`${new URL(url).host}${new URL(url).pathname}@${clock}`);
      return url.endsWith("robots.txt") ? new Response("", { status: 404 }) : new Response("ok");
    };
    const http = new PoliteHttpClient({
      fetch,
      minIntervalMs: 500,
      now: () => clock,
      sleep: async (ms) => {
        clock += ms;
      },
    });
    await http.get("https://tienda.com.uy/a");
    await http.get("https://tienda.com.uy/b");
    await http.get("https://www.tienda.com.uy/c"); // www. es el mismo dominio
    await http.get("https://otra.com.uy/d");
    expect(at).toEqual([
      "tienda.com.uy/robots.txt@1000",
      "tienda.com.uy/a@1500",
      "tienda.com.uy/b@2000",
      "www.tienda.com.uy/robots.txt@2500",
      "www.tienda.com.uy/c@3000",
      // Otro dominio: el primer request sale sin esperar el turno de tienda.com.uy.
      "otra.com.uy/robots.txt@3000",
      "otra.com.uy/d@3500",
    ]);
  });

  it("no pasa de N requests simultáneos por dominio", async () => {
    let active = 0;
    let peak = 0;
    const fetch: FetchLike = async (url) => {
      if (url.endsWith("robots.txt")) return new Response("", { status: 404 });
      active++;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active--;
      return new Response("ok");
    };
    const http = new PoliteHttpClient({ fetch, ...fast, perHostConcurrency: 2 });
    await Promise.all(
      Array.from({ length: 6 }, (_, i) => http.get(`https://tienda.com.uy/p/${i}`)),
    );
    expect(peak).toBe(2);
  });
});

describe("HttpProductFetcher", () => {
  it("solo acepta HTML y pide con user agent identificable", async () => {
    const seen: Array<Record<string, string>> = [];
    const fetch: FetchLike = async (url, init) => {
      seen.push(init.headers as Record<string, string>);
      if (url.endsWith("robots.txt")) return new Response("", { status: 404 });
      if (url.endsWith(".pdf")) {
        return new Response("%PDF", { headers: { "content-type": "application/pdf" } });
      }
      return new Response("<html></html>", {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    };
    const fetcher = new HttpProductFetcher(
      new PoliteHttpClient({ fetch, ...fast }),
      () => new Date("2026-10-01T12:00:00Z"),
    );
    const page = await fetcher.fetch("https://tienda.com.uy/p/1");
    expect(page).toMatchObject({ status: 200, fetchedAt: "2026-10-01T12:00:00.000Z" });
    expect(seen.at(-1)?.["user-agent"]).toMatch(/^AsesorEsteticoBot\//);
    await expect(fetcher.fetch("https://tienda.com.uy/catalogo.pdf")).rejects.toBeInstanceOf(
      NotHtmlError,
    );
  });
});
