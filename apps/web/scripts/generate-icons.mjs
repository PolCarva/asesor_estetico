#!/usr/bin/env node
// Genera los íconos placeholder de la PWA (PNG) sin dependencias externas.
// Uso: node scripts/generate-icons.mjs. Reemplazar por los íconos finales de marca.
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { deflateSync } from "node:zlib";

const INK = [27, 24, 21];
const IVORY = [246, 242, 236];
const CLAY = [154, 86, 54];

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
};

/** Monograma abstracto: anillo marfil y punto arcilla sobre tinta. */
function colorAt(x, y) {
  const dx = x - 0.5;
  const dy = y - 0.5;
  const r = Math.hypot(dx, dy);
  if (Math.hypot(x - 0.6, y - 0.4) < 0.07) return CLAY;
  if (r > 0.24 && r < 0.29) return IVORY;
  return INK;
}

function png(size) {
  const SS = 4; // supersampling para bordes suaves
  const raw = Buffer.alloc((size * 3 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 3 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const acc = [0, 0, 0];
      for (let sy = 0; sy < SS; sy++)
        for (let sx = 0; sx < SS; sx++) {
          const c = colorAt((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size);
          acc[0] += c[0];
          acc[1] += c[1];
          acc[2] += c[2];
        }
      const o = y * (size * 3 + 1) + 1 + x * 3;
      for (let i = 0; i < 3; i++) raw[o + i] = Math.round(acc[i] / (SS * SS));
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

const root = resolve(import.meta.dirname, "..");
mkdirSync(resolve(root, "public/icons"), { recursive: true });
const outputs = {
  "public/icons/icon-192.png": 192,
  "public/icons/icon-512.png": 512,
  "public/icons/maskable-512.png": 512,
  "src/app/icon.png": 64,
  "src/app/apple-icon.png": 180,
};
for (const [file, size] of Object.entries(outputs)) {
  writeFileSync(resolve(root, file), png(size));
  console.log(`[icons] ${file} (${size}px)`);
}
