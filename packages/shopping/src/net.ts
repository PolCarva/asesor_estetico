import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpRequest, type IncomingMessage } from "node:http";
import { request as httpsRequest } from "node:https";
import { isIPv4, isIPv6, type LookupFunction } from "node:net";
import { Readable } from "node:stream";
import { createBrotliDecompress, createGunzip, createInflate } from "node:zlib";

/**
 * Red hacia tiendas (anti-SSRF). Las URLs vienen de terceros (búsqueda web), así que el
 * host se valida dos veces: por nombre antes de pedir (`isSafeProductUrl`) y por IP al
 * conectar (`createSafeTransport`), que es lo que cierra el DNS rebinding.
 */

export class UnsafeUrlError extends Error {
  constructor(url: string, detail?: string) {
    super(`URL de producto no permitida: ${url}${detail ? ` (${detail})` : ""}`);
    this.name = "UnsafeUrlError";
  }
}

const ipv4Octets = (ip: string) => ip.split(".").map(Number);

/** [red, bits] de IPv4 que nunca son una tienda: privadas, loopback, CGNAT, reservadas… */
const BLOCKED_V4: Array<[string, number]> = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
];

const v4ToInt = (ip: string) => ipv4Octets(ip).reduce((acc, o) => acc * 256 + o, 0);

function isPublicIPv4(ip: string): boolean {
  const value = v4ToInt(ip);
  return !BLOCKED_V4.some(([net, bits]) => {
    const size = 2 ** (32 - bits);
    const start = v4ToInt(net);
    return value >= start && value < start + size;
  });
}

/** IPv6 en 8 grupos de 16 bits (la URL la canoniza: `::ffff:127.0.0.1` → `::ffff:7f00:1`). */
function ipv6Groups(ip: string): number[] | null {
  let host: string;
  try {
    host = new URL(`http://[${ip.split("%")[0]}]`).hostname.slice(1, -1);
  } catch {
    return null;
  }
  const [head = "", tail] = host.includes("::") ? host.split("::") : [host, undefined];
  const h = head ? head.split(":") : [];
  const t = tail ? tail.split(":") : [];
  const groups =
    tail === undefined ? h : [...h, ...Array<string>(8 - h.length - t.length).fill("0"), ...t];
  return groups.length === 8 ? groups.map((g) => parseInt(g, 16)) : null;
}

function isPublicIPv6(ip: string): boolean {
  const g = ipv6Groups(ip);
  if (!g) return false;
  const [g0 = 0, g1 = 0] = g;
  const embeddedV4 = `${g[6]! >> 8}.${g[6]! & 255}.${g[7]! >> 8}.${g[7]! & 255}`;
  const zeroPrefix = (n: number) => g.slice(0, n).every((x) => x === 0);
  // ::/96 (incluye :: y ::1) y ::ffff:0:0/96 (IPv4 mapeada): se juzga la IPv4.
  if (zeroPrefix(6)) return false;
  if (zeroPrefix(5) && g[5] === 0xffff) return isPublicIPv4(embeddedV4);
  // NAT64 (64:ff9b::/96): también lleva una IPv4 adentro.
  if (g0 === 0x64 && g1 === 0xff9b && g.slice(2, 6).every((x) => x === 0)) {
    return isPublicIPv4(embeddedV4);
  }
  if ((g0 & 0xfe00) === 0xfc00) return false; // fc00::/7 ULA
  if ((g0 & 0xffc0) === 0xfe80 || (g0 & 0xffc0) === 0xfec0) return false; // link/site-local
  if ((g0 & 0xff00) === 0xff00) return false; // multicast
  if (g0 === 0x2001 && (g1 === 0x0db8 || g1 === 0)) return false; // documentación, Teredo
  if (g0 === 0x2002) return false; // 6to4
  if (g0 === 0x100 && g.slice(1, 4).every((x) => x === 0)) return false; // 100::/64 descarte
  return (g0 & 0xe000) === 0x2000; // solo unicast global (2000::/3)
}

/** true si la IP es pública (se puede contactar como tienda). */
export function isPublicAddress(ip: string): boolean {
  if (isIPv4(ip)) return isPublicIPv4(ip);
  if (isIPv6(ip)) return isPublicIPv6(ip);
  return false;
}

/** Nombres que resuelven a la red interna aunque no sean una IP. */
const INTERNAL_HOST = /(^|\.)(localhost|local|internal|intranet|lan|home\.arpa)$/;

/**
 * Validación por nombre (sin DNS): solo http(s) a los puertos estándar, sin credenciales,
 * sin IPs privadas ni IPv6 literal, sin `localhost` (también `localhost.` y
 * `*.localhost`) ni nombres de una sola etiqueta (servicios de Docker como `db`).
 */
export function isSafeProductUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return false;
  if (url.username || url.password) return false;
  // `url.port` queda vacío con el puerto por defecto del esquema.
  if (url.port !== "") return false;
  const host = url.hostname.toLowerCase().replace(/\.+$/, "");
  if (!host || host.startsWith("[")) return false;
  // La URL ya normaliza 0x7f000001, 127.1, etc. a IPv4 con puntos.
  if (isIPv4(host)) return isPublicAddress(host);
  if (INTERNAL_HOST.test(host) || !host.includes(".")) return false;
  return true;
}

export interface ResolvedAddress {
  address: string;
  family: number;
}

export type ResolveHost = (hostname: string) => Promise<ResolvedAddress[]>;

const systemResolve: ResolveHost = (hostname) => dnsLookup(hostname, { all: true, verbatim: true });

/**
 * `lookup` para sockets: resuelve y rechaza si alguna IP no es pública. Como el socket
 * se conecta a la IP que devuelve esta función, no hay ventana para DNS rebinding.
 */
export function guardedLookup(
  resolve: ResolveHost = systemResolve,
  isAllowed: (ip: string) => boolean = isPublicAddress,
): LookupFunction {
  return (hostname, options, callback) => {
    resolve(hostname).then(
      (addresses) => {
        const family = options.family === 4 || options.family === 6 ? options.family : null;
        const usable = family ? addresses.filter((a) => a.family === family) : addresses;
        const blocked = usable.find((a) => !isAllowed(a.address));
        if (usable.length === 0 || blocked) {
          const error = new UnsafeUrlError(hostname, blocked ? "IP no pública" : "sin IP");
          callback(Object.assign(error, { code: "EUNSAFEHOST" }), "", 0);
          return;
        }
        if (options.all) callback(null, usable);
        else callback(null, usable[0]!.address, usable[0]!.family);
      },
      (error: NodeJS.ErrnoException) => callback(error, "", 0),
    );
  };
}

/** Lo mínimo de `fetch` que usa el cliente de tiendas (permite inyectar uno falso en tests). */
export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface SafeTransportOptions {
  resolve?: ResolveHost;
  /** Solo para tests contra un servidor local: por defecto, solo IPs públicas. */
  isAllowedAddress?: (ip: string) => boolean;
}

const NULL_BODY_STATUS = new Set([101, 103, 204, 205, 304]);

function decompress(res: IncomingMessage): Readable {
  const encoding = (res.headers["content-encoding"] ?? "").trim().toLowerCase();
  if (encoding === "gzip" || encoding === "x-gzip") return res.pipe(createGunzip());
  if (encoding === "deflate") return res.pipe(createInflate());
  if (encoding === "br") return res.pipe(createBrotliDecompress());
  return res;
}

/**
 * Transporte HTTP con la IP validada al conectar. No sigue redirects (los revalida el
 * cliente) y devuelve el cuerpo como stream para cortar por tamaño sin bajarlo entero.
 */
export function createSafeTransport(options: SafeTransportOptions = {}): FetchLike {
  const lookup = guardedLookup(options.resolve, options.isAllowedAddress);
  return (rawUrl, init) =>
    new Promise<Response>((resolve, reject) => {
      const url = new URL(rawUrl);
      const request = url.protocol === "https:" ? httpsRequest : httpRequest;
      const headers = new Headers(init.headers);
      headers.set("accept-encoding", "gzip, deflate, br");
      const req = request(
        url,
        {
          method: "GET",
          headers: Object.fromEntries(headers),
          lookup,
          signal: init.signal ?? undefined,
        },
        (res) => {
          const out = new Headers();
          for (let i = 0; i + 1 < res.rawHeaders.length; i += 2) {
            try {
              out.append(res.rawHeaders[i]!, res.rawHeaders[i + 1]!);
            } catch {
              // Cabecera con bytes inválidos: se ignora.
            }
          }
          if (res.headers["content-encoding"]) {
            // El cuerpo sale descomprimido: el largo declarado ya no aplica.
            out.delete("content-encoding");
            out.delete("content-length");
          }
          const status = res.statusCode ?? 502;
          if (NULL_BODY_STATUS.has(status)) {
            res.resume();
            resolve(new Response(null, { status, headers: out }));
            return;
          }
          const body = decompress(res);
          // Si el cliente corta (tope de tamaño) o el stream falla, se cierra el socket.
          body.once("close", () => {
            if (!res.complete) res.destroy();
          });
          resolve(
            new Response(Readable.toWeb(body) as unknown as ReadableStream<Uint8Array>, {
              status,
              headers: out,
            }),
          );
        },
      );
      req.on("error", reject);
      req.end();
    });
}
