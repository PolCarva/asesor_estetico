import { isSafeProductUrl, UnsafeUrlError } from "../fetch";
import {
  ALLOW_ALL,
  DISALLOW_ALL,
  isAllowedByRobots,
  parseRobots,
  type RobotsPolicy,
} from "./robots";

/** Token del bot: es lo que buscan los grupos de robots.txt. */
export const BOT_TOKEN = "AsesorEsteticoBot";
export const BOT_VERSION = "1.0";

export function buildUserAgent(contact?: string): string {
  const info = ["asesor de imagen, busca productos en tiendas de Uruguay", contact]
    .filter(Boolean)
    .join("; ");
  return `${BOT_TOKEN}/${BOT_VERSION} (${info})`;
}

export class RobotsDisallowedError extends Error {
  constructor(readonly url: string) {
    super(`robots.txt no permite ${url}`);
    this.name = "RobotsDisallowedError";
  }
}

export class HttpStatusError extends Error {
  constructor(
    readonly url: string,
    readonly status: number,
  ) {
    super(`HTTP ${status} en ${url}`);
    this.name = "HttpStatusError";
  }
}

export interface HttpResponse {
  url: string;
  status: number;
  contentType: string;
  headers: Headers;
  body: string;
}

export interface PoliteHttpOptions {
  userAgent?: string;
  timeoutMs?: number;
  /** Requests simultáneos por host. */
  perHostConcurrency?: number;
  /** Tamaño máximo de una respuesta (bytes). */
  maxBytes?: number;
  /** Cuánto se guarda un robots.txt descargado. */
  robotsTtlMs?: number;
  fetch?: typeof fetch;
  now?: () => number;
}

/** Semáforo simple por host. */
class HostLimiter {
  private active = new Map<string, number>();
  private waiting = new Map<string, Array<() => void>>();

  constructor(private readonly limit: number) {}

  async run<T>(host: string, fn: () => Promise<T>): Promise<T> {
    if ((this.active.get(host) ?? 0) >= this.limit) {
      await new Promise<void>((resolve) => {
        const queue = this.waiting.get(host) ?? [];
        queue.push(resolve);
        this.waiting.set(host, queue);
      });
    }
    this.active.set(host, (this.active.get(host) ?? 0) + 1);
    try {
      return await fn();
    } finally {
      this.active.set(host, (this.active.get(host) ?? 1) - 1);
      this.waiting.get(host)?.shift()?.();
    }
  }
}

/**
 * Cliente HTTP para tiendas: user agent identificable, robots.txt respetado (cacheado),
 * timeout, tope de tamaño, concurrencia por host y bloqueo de URLs internas (SSRF). No
 * evade protecciones: un 403 o un desafío anti-bot es una falla más.
 */
export class PoliteHttpClient {
  readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly robotsTtlMs: number;
  private readonly fetchFn: typeof fetch;
  private readonly now: () => number;
  private readonly limiter: HostLimiter;
  private readonly robots = new Map<string, { policy: Promise<RobotsPolicy>; at: number }>();

  constructor(options: PoliteHttpOptions = {}) {
    this.userAgent = options.userAgent ?? buildUserAgent();
    this.timeoutMs = options.timeoutMs ?? 12_000;
    this.maxBytes = options.maxBytes ?? 6 * 1024 * 1024;
    this.robotsTtlMs = options.robotsTtlMs ?? 6 * 60 * 60 * 1000;
    this.fetchFn = options.fetch ?? fetch;
    this.now = options.now ?? Date.now;
    this.limiter = new HostLimiter(options.perHostConcurrency ?? 2);
  }

  /** Política de robots.txt del origen (descargada una vez por TTL). */
  robotsFor(origin: string): Promise<RobotsPolicy> {
    const cached = this.robots.get(origin);
    if (cached && this.now() - cached.at < this.robotsTtlMs) return cached.policy;
    const policy = this.downloadRobots(origin);
    this.robots.set(origin, { policy, at: this.now() });
    return policy;
  }

  private async downloadRobots(origin: string): Promise<RobotsPolicy> {
    try {
      const res = await this.raw(`${origin}/robots.txt`);
      if (res.status >= 400 && res.status < 500) return ALLOW_ALL;
      if (res.status >= 500) return DISALLOW_ALL;
      return parseRobots(res.body);
    } catch {
      // Sin robots.txt legible no se sabe qué se permite: se asume que nada (RFC 9309).
      return DISALLOW_ALL;
    }
  }

  async isAllowed(rawUrl: string): Promise<boolean> {
    const url = new URL(rawUrl);
    const policy = await this.robotsFor(url.origin);
    return isAllowedByRobots(policy, BOT_TOKEN, `${url.pathname}${url.search}`);
  }

  /** GET respetando robots.txt. Lanza si robots lo prohíbe, si falla o si no es 2xx. */
  async get(rawUrl: string, init: { accept?: string; signal?: AbortSignal } = {}) {
    if (!isSafeProductUrl(rawUrl)) throw new UnsafeUrlError(rawUrl);
    if (!(await this.isAllowed(rawUrl))) throw new RobotsDisallowedError(rawUrl);
    const res = await this.raw(rawUrl, init);
    if (res.status < 200 || res.status >= 300) throw new HttpStatusError(rawUrl, res.status);
    return res;
  }

  private raw(rawUrl: string, init: { accept?: string; signal?: AbortSignal } = {}) {
    const host = new URL(rawUrl).host;
    return this.limiter.run(host, async (): Promise<HttpResponse> => {
      const signals = [AbortSignal.timeout(this.timeoutMs), init.signal].filter(
        (s): s is AbortSignal => Boolean(s),
      );
      const res = await this.fetchFn(rawUrl, {
        headers: {
          "user-agent": this.userAgent,
          accept: init.accept ?? "text/html,application/json;q=0.9,*/*;q=0.5",
          "accept-language": "es-UY,es;q=0.9",
        },
        redirect: "follow",
        signal: AbortSignal.any(signals),
      });
      // Un redirect no puede terminar en un host interno.
      if (res.url && !isSafeProductUrl(res.url)) throw new UnsafeUrlError(res.url);
      const declared = Number(res.headers.get("content-length") ?? 0);
      if (declared > this.maxBytes) throw new Error(`Respuesta demasiado grande: ${rawUrl}`);
      const body = await res.text();
      if (body.length > this.maxBytes) throw new Error(`Respuesta demasiado grande: ${rawUrl}`);
      return {
        url: res.url || rawUrl,
        status: res.status,
        contentType: res.headers.get("content-type") ?? "",
        headers: res.headers,
        body,
      };
    });
  }
}
