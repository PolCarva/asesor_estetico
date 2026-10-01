import { createSafeTransport, type FetchLike, isSafeProductUrl, UnsafeUrlError } from "../net";
import { bareHost } from "./registry";
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

export class ResponseTooLargeError extends Error {
  constructor(
    readonly url: string,
    readonly maxBytes: number,
  ) {
    super(`Respuesta de más de ${maxBytes} bytes en ${url}`);
    this.name = "ResponseTooLargeError";
  }
}

export class TooManyRedirectsError extends Error {
  constructor(readonly url: string) {
    super(`Demasiadas redirecciones desde ${url}`);
    this.name = "TooManyRedirectsError";
  }
}

export interface HttpResponse {
  url: string;
  status: number;
  contentType: string;
  headers: Headers;
  body: string;
}

export interface HttpGetOptions {
  accept?: string;
  signal?: AbortSignal;
  /** Tope de tamaño de esta respuesta (por defecto, el del cliente). */
  maxBytes?: number;
}

export interface PoliteHttpOptions {
  userAgent?: string;
  timeoutMs?: number;
  /** Requests simultáneos por dominio. */
  perHostConcurrency?: number;
  /** Separación mínima entre requests al mismo dominio (ms). */
  minIntervalMs?: number;
  /** Tamaño máximo de una respuesta (bytes, ya descomprimida). */
  maxBytes?: number;
  maxRedirects?: number;
  /** Cuánto se guarda un robots.txt descargado. */
  robotsTtlMs?: number;
  /** Transporte; por defecto `createSafeTransport()` (IP validada al conectar). */
  fetch?: FetchLike;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const REDIRECT_STATUS = new Set([301, 302, 303, 307, 308]);

/** Concurrencia y ritmo por dominio: `limit` a la vez y uno cada `minIntervalMs`. */
class HostLimiter {
  private active = new Map<string, number>();
  private waiting = new Map<string, Array<() => void>>();
  private nextStart = new Map<string, number>();

  constructor(
    private readonly limit: number,
    private readonly minIntervalMs: number,
    private readonly now: () => number,
    private readonly sleep: (ms: number) => Promise<void>,
  ) {}

  async run<T>(host: string, fn: () => Promise<T>): Promise<T> {
    await this.acquire(host);
    try {
      // El turno se reserva antes de esperar, así dos requests no toman el mismo.
      const now = this.now();
      const start = Math.max(now, this.nextStart.get(host) ?? 0);
      this.nextStart.set(host, start + this.minIntervalMs);
      if (start > now) await this.sleep(start - now);
      return await fn();
    } finally {
      this.release(host);
    }
  }

  private async acquire(host: string) {
    const active = this.active.get(host) ?? 0;
    if (active < this.limit) {
      this.active.set(host, active + 1);
      return;
    }
    // El lugar se pasa directo al que espera (release no lo libera).
    await new Promise<void>((resolve) => {
      const queue = this.waiting.get(host) ?? [];
      queue.push(resolve);
      this.waiting.set(host, queue);
    });
  }

  private release(host: string) {
    const next = this.waiting.get(host)?.shift();
    if (next) next();
    else this.active.set(host, (this.active.get(host) ?? 1) - 1);
  }
}

function charsetOf(contentType: string): string {
  const charset = /charset=["']?([\w-]+)/i.exec(contentType)?.[1]?.toLowerCase() ?? "utf-8";
  try {
    new TextDecoder(charset);
    return charset;
  } catch {
    return "utf-8";
  }
}

/** Lee el cuerpo cortando apenas pasa el tope (no se baja entero para medirlo). */
async function readLimited(res: Response, url: string, maxBytes: number): Promise<string> {
  const declared = Number(res.headers.get("content-length") ?? 0);
  if (declared > maxBytes) {
    await res.body?.cancel();
    throw new ResponseTooLargeError(url, maxBytes);
  }
  if (!res.body) return "";
  const decoder = new TextDecoder(charsetOf(res.headers.get("content-type") ?? ""));
  const reader = res.body.getReader();
  let size = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      throw new ResponseTooLargeError(url, maxBytes);
    }
    text += decoder.decode(value, { stream: true });
  }
  return text + decoder.decode();
}

/**
 * Cliente HTTP para tiendas: user agent identificable, robots.txt respetado (cacheado),
 * timeout, tope de tamaño, concurrencia y ritmo por dominio, y anti-SSRF en cada salto
 * (redirects manuales: cada destino se valida y pasa por su robots.txt). No evade
 * protecciones: un 403 o un desafío anti-bot es una falla más.
 */
export class PoliteHttpClient {
  readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly maxRedirects: number;
  private readonly robotsTtlMs: number;
  private readonly fetchFn: FetchLike;
  private readonly now: () => number;
  private readonly limiter: HostLimiter;
  private readonly robots = new Map<string, { policy: Promise<RobotsPolicy>; at: number }>();

  constructor(options: PoliteHttpOptions = {}) {
    this.userAgent = options.userAgent ?? buildUserAgent();
    this.timeoutMs = options.timeoutMs ?? 12_000;
    this.maxBytes = options.maxBytes ?? 6 * 1024 * 1024;
    this.maxRedirects = options.maxRedirects ?? 5;
    this.robotsTtlMs = options.robotsTtlMs ?? 6 * 60 * 60 * 1000;
    this.fetchFn = options.fetch ?? createSafeTransport();
    this.now = options.now ?? Date.now;
    this.limiter = new HostLimiter(
      options.perHostConcurrency ?? 2,
      options.minIntervalMs ?? 300,
      this.now,
      options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
    );
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
      const res = await this.request(`${origin}/robots.txt`, {}, false);
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
  async get(rawUrl: string, init: HttpGetOptions = {}): Promise<HttpResponse> {
    const res = await this.request(rawUrl, init, true);
    if (res.status < 200 || res.status >= 300) throw new HttpStatusError(res.url, res.status);
    return res;
  }

  /** Sigue redirects a mano: cada salto se valida (SSRF) y, si corresponde, por robots. */
  private async request(
    rawUrl: string,
    init: HttpGetOptions,
    checkRobots: boolean,
  ): Promise<HttpResponse> {
    let url = rawUrl;
    for (let hop = 0; hop <= this.maxRedirects; hop++) {
      if (!isSafeProductUrl(url)) throw new UnsafeUrlError(url);
      if (checkRobots && !(await this.isAllowed(url))) throw new RobotsDisallowedError(url);
      const hop = await this.once(url, init);
      if (hop.response) return hop.response;
      url = hop.location;
    }
    throw new TooManyRedirectsError(rawUrl);
  }

  private once(url: string, init: HttpGetOptions) {
    type Hop =
      { response: HttpResponse; location?: never } | { response?: never; location: string };
    return this.limiter.run(bareHost(new URL(url).hostname), async (): Promise<Hop> => {
      const signals = [AbortSignal.timeout(this.timeoutMs), init.signal].filter(
        (s): s is AbortSignal => Boolean(s),
      );
      const signal = AbortSignal.any(signals);
      const res = await this.fetchFn(url, {
        headers: {
          "user-agent": this.userAgent,
          accept: init.accept ?? "text/html,application/json;q=0.9,*/*;q=0.5",
          "accept-language": "es-UY,es;q=0.9",
        },
        redirect: "manual",
        signal,
      });
      const location = res.headers.get("location");
      if (REDIRECT_STATUS.has(res.status) && location) {
        await res.body?.cancel();
        return { location: new URL(location, url).toString() };
      }
      const contentType = res.headers.get("content-type") ?? "";
      const body = await readLimited(res, url, init.maxBytes ?? this.maxBytes);
      return { response: { url, status: res.status, contentType, headers: res.headers, body } };
    });
  }
}
