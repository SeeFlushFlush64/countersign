import { crc32 } from "node:zlib";
import { PDFDocument } from "pdf-lib";

// Server-side validation of a drawn signature. The value arrives from a public
// form, so nothing about it is trusted: it must be a PNG data URL, small, a
// structurally valid PNG with sane dimensions, and actually decodable.
// Signatures are never placed into HTML or fetched by anything — after
// validation only the decoded bytes are used, embedded with pdf-lib.

export const SIGNATURE_LIMITS = {
  maxDataUrlLength: 400_000,
  maxBytes: 250_000,
  maxWidth: 2400,
  maxHeight: 1200,
} as const;

export class InvalidSignatureError extends Error {}

export type ValidSignature = {
  png: Uint8Array;
  width: number;
  height: number;
};

const DATA_URL_PREFIX = "data:image/png;base64,";
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
const PNG_MAGIC = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
// Bit depths allowed per PNG colour type (the canvas emits 8-bit RGBA).
const ALLOWED_DEPTHS: Record<number, number[]> = {
  0: [1, 2, 4, 8],
  2: [8],
  3: [1, 2, 4, 8],
  4: [8],
  6: [8],
};

function reject(reason: string): never {
  throw new InvalidSignatureError(`Invalid signature: ${reason}.`);
}

function parsePngStructure(png: Uint8Array): { width: number; height: number } {
  if (png.length < 8 + 25 + 12 || PNG_MAGIC.some((b, i) => png[i] !== b)) {
    reject("not a PNG image");
  }
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);

  let offset = 8;
  let width = 0;
  let height = 0;
  let sawIdat = false;
  let index = 0;

  while (offset < png.length) {
    if (offset + 12 > png.length) reject("truncated PNG chunk");
    const length = view.getUint32(offset);
    const typeStart = offset + 4;
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > png.length) reject("truncated PNG chunk");

    const type = String.fromCharCode(...png.subarray(typeStart, dataStart));
    const expectedCrc = view.getUint32(dataEnd);
    if (crc32(png.subarray(typeStart, dataEnd)) !== expectedCrc) {
      reject("corrupt PNG chunk");
    }

    if (index === 0) {
      if (type !== "IHDR" || length !== 13) reject("PNG has no header");
      width = view.getUint32(dataStart);
      height = view.getUint32(dataStart + 4);
      const depth = png[dataStart + 8];
      const colourType = png[dataStart + 9];
      const interlace = png[dataStart + 12];
      if (!ALLOWED_DEPTHS[colourType]?.includes(depth) || interlace > 1) {
        reject("unsupported PNG format");
      }
    } else if (type === "IHDR") {
      reject("duplicate PNG header");
    } else if (type === "acTL") {
      reject("animated PNGs are not accepted");
    } else if (type === "IDAT") {
      sawIdat = true;
    } else if (type === "IEND") {
      if (dataEnd + 4 !== png.length) reject("data after the end of the PNG");
      if (!sawIdat) reject("PNG has no image data");
      return { width, height };
    }

    offset = dataEnd + 4;
    index += 1;
  }
  reject("PNG has no end marker");
}

export async function validateSignature(dataUrl: unknown): Promise<ValidSignature> {
  if (typeof dataUrl !== "string") reject("expected a PNG data URL");
  if (dataUrl.length > SIGNATURE_LIMITS.maxDataUrlLength) reject("image is too large");
  if (!dataUrl.startsWith(DATA_URL_PREFIX)) reject("only PNG data URLs are accepted");

  const base64 = dataUrl.slice(DATA_URL_PREFIX.length);
  if (!BASE64.test(base64)) reject("malformed base64");
  const png = new Uint8Array(Buffer.from(base64, "base64"));
  if (png.length > SIGNATURE_LIMITS.maxBytes) reject("image is too large");

  const { width, height } = parsePngStructure(png);
  if (
    width < 1 ||
    height < 1 ||
    width > SIGNATURE_LIMITS.maxWidth ||
    height > SIGNATURE_LIMITS.maxHeight
  ) {
    reject("image dimensions are out of range");
  }

  // The structural checks bound the decode cost (dimensions are capped), so
  // decoding is safe; it proves the execution page will be able to embed it.
  try {
    const probe = await PDFDocument.create();
    await probe.embedPng(png);
  } catch {
    reject("PNG could not be decoded");
  }

  return { png, width, height };
}

export function toDataUrl(png: Uint8Array): string {
  return DATA_URL_PREFIX + Buffer.from(png).toString("base64");
}
