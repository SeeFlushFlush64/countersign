import http from "node:http";
import { crc32, deflateSync } from "node:zlib";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { signWithLink } from "@/lib/documents";
import {
  InvalidSignatureError,
  SIGNATURE_LIMITS,
  validateSignature,
} from "@/lib/signature";
import { DocumentStatus } from "@/generated/prisma/enums";
import { expectPrivateEmptyDatabase } from "./harness/private-database";
import { signaturePng } from "../prisma/png-signature";
import { makeAgreement, makeCompany, stateOf } from "./helpers/agreements";

// Audit finding (High): the public signing action accepted any string as the
// signature and placed it in an <img src> that server-side Chromium fetched
// (SSRF). Signatures must now be small, structurally valid, decodable PNG
// data URLs, and are never handed to a browser.

const asDataUrl = (png: Buffer) => `data:image/png;base64,${png.toString("base64")}`;

function chunk(type: string, data: Buffer) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

function png({
  width = 4,
  height = 4,
  idat,
  extraChunks = [],
}: { width?: number; height?: number; idat?: Buffer; extraChunks?: Buffer[] } = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(Math.min(height, 4) * (Math.min(width, 4) * 4 + 1));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    ...extraChunks,
    chunk("IDAT", idat ?? deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

async function rejection(value: unknown) {
  return validateSignature(value).then(
    () => null,
    (e: unknown) => e,
  );
}

describe("validateSignature", () => {
  it("accepts a real signature PNG", async () => {
    const result = await validateSignature(asDataUrl(signaturePng("Jane Doe")));
    expect(result.width).toBe(480);
    expect(result.height).toBe(140);
  });

  it.each([
    ["an http URL (the SSRF vector)", "http://127.0.0.1:9/ssrf.png"],
    ["a file URL", "file:///etc/passwd"],
    ["an SVG data URL", "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="],
    ["a JPEG data URL", "data:image/jpeg;base64,/9j/4AAQSkZJRg=="],
    ["plain text", "not a signature"],
    ["malformed base64", "data:image/png;base64,@@@@"],
    ["a non-string", { src: "x" }],
    ["an empty PNG payload", "data:image/png;base64,"],
  ])("rejects %s", async (_label, value) => {
    expect(await rejection(value)).toBeInstanceOf(InvalidSignatureError);
  });

  it("rejects an oversized data URL before decoding it", async () => {
    const huge = "data:image/png;base64," + "A".repeat(SIGNATURE_LIMITS.maxDataUrlLength);
    expect(String(await rejection(huge))).toMatch(/too large/);
  });

  it("rejects a decoded PNG over the byte limit", async () => {
    const big = png({
      extraChunks: [chunk("tEXt", Buffer.alloc(SIGNATURE_LIMITS.maxBytes, 0x41))],
    });
    expect(String(await rejection(asDataUrl(big)))).toMatch(/too large/);
  });

  it("rejects dimensions beyond the limits (decompression-bomb guard)", async () => {
    const wide = png({ width: SIGNATURE_LIMITS.maxWidth + 1, height: 10 });
    expect(String(await rejection(asDataUrl(wide)))).toMatch(/dimensions/);
  });

  it("rejects a PNG with a corrupted chunk checksum", async () => {
    const corrupt = png();
    corrupt[corrupt.length - 20] ^= 0xff;
    expect(await rejection(asDataUrl(corrupt))).toBeInstanceOf(InvalidSignatureError);
  });

  it("rejects trailing data after the end of the PNG", async () => {
    const trailing = Buffer.concat([png(), Buffer.from("<script>alert(1)</script>")]);
    expect(String(await rejection(asDataUrl(trailing)))).toMatch(/after the end/);
  });

  it("rejects animated PNGs", async () => {
    const animated = png({ extraChunks: [chunk("acTL", Buffer.alloc(8))] });
    expect(String(await rejection(asDataUrl(animated)))).toMatch(/animated/);
  });

  it("rejects a well-formed PNG whose image data cannot be decoded", async () => {
    const garbage = png({ idat: Buffer.from("definitely not zlib data") });
    expect(String(await rejection(asDataUrl(garbage)))).toMatch(/could not be decoded/);
  });
});

describe("signing with an unsafe signature", () => {
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url ?? "");
    res.end();
  });

  beforeAll(async () => {
    await expectPrivateEmptyDatabase();
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  });
  afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

  it("is refused, changes nothing, and fetches nothing", async () => {
    const company = await makeCompany();
    const a = await makeAgreement(company, "sent");
    const { port } = server.address() as { port: number };

    await expect(
      signWithLink(a.token, {
        signature: `http://127.0.0.1:${port}/ssrf-from-signature.png`,
        expectedSha256: a.frozenSha256,
      }),
    ).rejects.toMatchObject({ code: "INVALID" });

    expect(hits).toEqual([]);
    const state = await stateOf(a.id);
    expect(state.status).toBe(DocumentStatus.SENT);
    expect(state.events.SIGNED).toBe(0);
  });
});
