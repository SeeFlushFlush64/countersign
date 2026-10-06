import { crc32, deflateSync } from "node:zlib";

// Deterministic stand-in for a hand-drawn signature, used by the seed and the
// tests: a smooth pen stroke whose shape is derived from the signer's name,
// encoded as a real 8-bit RGBA PNG (the same format the signature pad emits).

const WIDTH = 480;
const HEIGHT = 140;

function hashSeed(text: string): number {
  let h = 2166136261;
  for (const ch of text) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function chunk(type: string, data: Buffer): Buffer {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const typeAndData = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeAndData));
  return Buffer.concat([length, typeAndData, crc]);
}

export function signaturePng(name: string): Buffer {
  const rgba = Buffer.alloc(WIDTH * HEIGHT * 4); // fully transparent
  const seed = hashSeed(name);

  const ink = (x: number, y: number) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const px = Math.round(x) + dx;
        const py = Math.round(y) + dy;
        if (px < 0 || py < 0 || px >= WIDTH || py >= HEIGHT) continue;
        const i = (py * WIDTH + px) * 4;
        rgba[i] = 0x0c;
        rgba[i + 1] = 0x11;
        rgba[i + 2] = 0x16;
        rgba[i + 3] = 0xff;
      }
    }
  };

  const loops = 3 + (seed % 4);
  const amplitude = 22 + (seed % 17);
  for (let t = 0; t <= 1; t += 1 / 4000) {
    const x = 20 + t * (WIDTH - 40);
    const y =
      HEIGHT / 2 +
      amplitude * Math.sin(t * Math.PI * 2 * loops + (seed % 7)) * (1 - t * 0.5) +
      8 * Math.sin(t * Math.PI * 9);
    ink(x, y);
  }

  const raw = Buffer.alloc((WIDTH * 4 + 1) * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) {
    raw[y * (WIDTH * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (WIDTH * 4 + 1) + 1, y * WIDTH * 4, (y + 1) * WIDTH * 4);
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(WIDTH, 0);
  ihdr.writeUInt32BE(HEIGHT, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export function signatureDataUrl(name: string): string {
  return `data:image/png;base64,${signaturePng(name).toString("base64")}`;
}
