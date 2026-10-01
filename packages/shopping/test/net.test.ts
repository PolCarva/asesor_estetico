import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { gzipSync } from "node:zlib";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createSafeTransport,
  guardedLookup,
  isPublicAddress,
  isSafeProductUrl,
  UnsafeUrlError,
} from "../src";

describe("isSafeProductUrl (por nombre, sin DNS)", () => {
  it("acepta tiendas por http(s) en el puerto estándar", () => {
    expect(isSafeProductUrl("https://www.legacy.com.uy/catalogo/x")).toBe(true);
    expect(isSafeProductUrl("http://tienda.com.uy/p/1")).toBe(true);
    expect(isSafeProductUrl("https://tienda.com.uy:443/p/1")).toBe(true);
  });

  it.each([
    ["localhost", "http://localhost:3000"],
    ["localhost con punto final", "http://localhost./admin"],
    ["subdominio de localhost", "http://api.localhost/"],
    ["loopback", "http://127.0.0.1/admin"],
    ["loopback en decimal", "http://2130706433/"],
    ["loopback en hexa", "http://0x7f000001/"],
    ["loopback abreviado", "http://127.1/"],
    ["0.x.x.x", "http://0.0.0.0/"],
    ["red privada 10/8", "http://10.0.0.1"],
    ["red privada 192.168/16", "http://192.168.1.2"],
    ["red privada 172.16/12", "http://172.20.0.5/"],
    ["CGNAT 100.64/10", "http://100.64.0.1/"],
    ["metadata de la nube", "http://169.254.169.254/latest/meta-data/"],
    ["IPv6 literal", "http://[::1]/"],
    ["IPv4 mapeada en IPv6", "http://[::ffff:127.0.0.1]/"],
    [".internal", "http://metadata.google.internal/"],
    [".local", "http://impresora.local/"],
    ["nombre de una etiqueta (servicio Docker)", "http://db/"],
    ["puerto no estándar", "https://tienda.com.uy:8443/p/1"],
    ["credenciales en la URL", "https://user:pw@tienda.com.uy"],
    ["esquema file", "file:///etc/passwd"],
    ["esquema gopher", "gopher://tienda.com.uy/"],
  ])("rechaza %s", (_caso, url) => {
    expect(isSafeProductUrl(url)).toBe(false);
  });
});

describe("isPublicAddress (después de resolver DNS)", () => {
  it.each([
    "127.0.0.1",
    "10.1.2.3",
    "172.31.255.255",
    "192.168.0.10",
    "100.100.100.100",
    "169.254.169.254",
    "0.1.2.3",
    "224.0.0.1",
    "255.255.255.255",
    "::",
    "::1",
    "::ffff:10.0.0.1",
    "64:ff9b::7f00:1",
    "fd00::1",
    "fe80::1",
    "ff02::1",
    "2001:db8::1",
  ])("%s no es pública", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });

  it.each(["190.64.1.10", "8.8.8.8", "100.128.0.1", "2800:a4:1::1", "::ffff:190.64.1.10"])(
    "%s es pública",
    (ip) => {
      expect(isPublicAddress(ip)).toBe(true);
    },
  );
});

describe("guardedLookup", () => {
  const lookup = (resolve: Parameters<typeof guardedLookup>[0], all = false) =>
    new Promise<unknown>((ok, fail) =>
      guardedLookup(resolve)("tienda.com.uy", { all }, (error, address) =>
        error ? fail(error) : ok(address),
      ),
    );

  it("rechaza un dominio que resuelve a una IP privada (DNS rebinding)", async () => {
    await expect(lookup(async () => [{ address: "10.0.0.5", family: 4 }])).rejects.toBeInstanceOf(
      UnsafeUrlError,
    );
    // Basta con que una de las IPs sea privada.
    await expect(
      lookup(async () => [
        { address: "190.64.1.10", family: 4 },
        { address: "127.0.0.1", family: 4 },
      ]),
    ).rejects.toBeInstanceOf(UnsafeUrlError);
  });

  it("deja pasar IPs públicas", async () => {
    expect(await lookup(async () => [{ address: "190.64.1.10", family: 4 }])).toBe("190.64.1.10");
    expect(await lookup(async () => [{ address: "190.64.1.10", family: 4 }], true)).toEqual([
      { address: "190.64.1.10", family: 4 },
    ]);
  });
});

describe("createSafeTransport (sockets reales contra un servidor local)", () => {
  let server: Server;
  let port = 0;
  const hits: string[] = [];

  beforeAll(async () => {
    server = createServer((req, res) => {
      hits.push(req.url ?? "");
      if (req.url === "/gzip") {
        res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
        res.end(gzipSync("<html>hola comprimido</html>"));
      } else if (req.url === "/redirect") {
        res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" });
        res.end();
      } else {
        res.writeHead(200, { "content-type": "text/html" });
        res.end("<html>ok</html>");
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  // Un dominio "público" cuyo DNS apunta a la máquina local.
  const toLocal = async () => [{ address: "127.0.0.1", family: 4 }];

  it("no se conecta si el DNS devuelve una IP privada", async () => {
    const transport = createSafeTransport({ resolve: toLocal });
    const before = hits.length;
    await expect(
      transport(`http://tienda.com.uy:${port}/`, { headers: {} }),
    ).rejects.toBeInstanceOf(UnsafeUrlError);
    expect(hits.length).toBe(before);
  });

  it("descomprime y no sigue redirects (los revalida el cliente)", async () => {
    // Solo en este test se permite la IP local, para poder hablar con el servidor.
    const transport = createSafeTransport({ resolve: toLocal, isAllowedAddress: () => true });
    const res = await transport(`http://tienda.com.uy:${port}/gzip`, { headers: {} });
    expect(res.headers.get("content-encoding")).toBeNull();
    expect(await res.text()).toBe("<html>hola comprimido</html>");

    const redirect = await transport(`http://tienda.com.uy:${port}/redirect`, { headers: {} });
    expect(redirect.status).toBe(302);
    expect(redirect.headers.get("location")).toBe("http://169.254.169.254/latest/meta-data/");
  });
});
