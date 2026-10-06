import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { sendDocument, reissueSigningLink } from "@/lib/documents";
import { DeliveryConfigError, deliveryAdapter, demoOutboxAdapter } from "@/lib/delivery/adapters";
import {
  decryptLinkToken,
  encryptLinkToken,
  MissingOutboxKeyError,
  outboxKey,
} from "@/lib/delivery/link-crypto";
import { DocumentStatus } from "@/generated/prisma/enums";
import { expectPrivateEmptyDatabase } from "./harness/private-database";
import { type Company, makeAgreement, makeCompany, stateOf } from "./helpers/agreements";

// No production integration can be enabled by configuration: there is no
// email provider and no Google Drive in the signing lifecycle. Production
// fails closed on missing delivery configuration and on a missing outbox key.

let company: Company;

beforeAll(async () => {
  await expectPrivateEmptyDatabase();
  company = await makeCompany();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

const manager = () => ({ userId: company.paralegal.userId });
const KEY = "k".repeat(32);

describe("delivery mode", () => {
  it("defaults to the demo outbox outside production", () => {
    expect(deliveryAdapter({ NODE_ENV: "development" })).toBe(demoOutboxAdapter);
    expect(deliveryAdapter({ NODE_ENV: "test" })).toBe(demoOutboxAdapter);
  });

  it("must be chosen explicitly in production", () => {
    expect(() => deliveryAdapter({ NODE_ENV: "production" })).toThrowError(DeliveryConfigError);
    expect(deliveryAdapter({ NODE_ENV: "production", DELIVERY_MODE: "demo-outbox" })).toBe(
      demoOutboxAdapter,
    );
  });

  it.each(["resend", "smtp", "gmail", "google-drive", "email"])(
    "refuses %s: no production integration exists",
    (mode) => {
      expect(() => deliveryAdapter({ NODE_ENV: "production", DELIVERY_MODE: mode })).toThrowError(
        /Unsupported DELIVERY_MODE/,
      );
      expect(() => deliveryAdapter({ NODE_ENV: "development", DELIVERY_MODE: mode })).toThrowError(
        DeliveryConfigError,
      );
    },
  );

  it("ignores provider credentials in the environment", () => {
    const env = {
      NODE_ENV: "development",
      RESEND_API_KEY: "re_not_a_real_key",
      GOOGLE_OAUTH_REFRESH_TOKEN: "not-a-real-token",
    } as const;
    expect(deliveryAdapter(env)).toBe(demoOutboxAdapter);
    expect(() => deliveryAdapter({ ...env, NODE_ENV: "production" })).toThrowError(DeliveryConfigError);
  });

  it("a misconfigured delivery fails the message, never the agreement", async () => {
    vi.stubEnv("DELIVERY_MODE", "resend");
    const a = await makeAgreement(company, "draft");
    await sendDocument(a.id, manager());
    expect((await stateOf(a.id)).status).toBe(DocumentStatus.SENT);
    const message = await prisma.outboundMessage.findFirstOrThrow({ where: { documentId: a.id } });
    expect(message).toMatchObject({ status: "FAILED", attempts: 1 });
    expect(message.lastError).toMatch(/Unsupported DELIVERY_MODE/);
    // The configured value is not echoed back.
    expect(message.lastError).not.toMatch(/resend/);
  });
});

describe("outbox encryption key", () => {
  it("is required in production, before anything changes", async () => {
    const a = await makeAgreement(company, "draft");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OUTBOX_ENCRYPTION_KEY", "");
    await expect(sendDocument(a.id, manager())).rejects.toBeInstanceOf(MissingOutboxKeyError);
    expect((await stateOf(a.id)).status).toBe(DocumentStatus.DRAFT);
    expect(await prisma.signingLink.count({ where: { documentId: a.id } })).toBe(0);
    expect(await prisma.outboundMessage.count({ where: { documentId: a.id } })).toBe(0);
  });

  it("is required in production for a reissue too", async () => {
    const a = await makeAgreement(company, "sent");
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("OUTBOX_ENCRYPTION_KEY", "");
    await expect(
      reissueSigningLink(a.id, manager(), { expectedLinkId: a.linkId }),
    ).rejects.toBeInstanceOf(MissingOutboxKeyError);
    const link = await prisma.signingLink.findUniqueOrThrow({ where: { id: a.linkId } });
    expect(link.revokedAt).toBeNull();
  });

  it("rejects a key that is too short, in any environment", () => {
    expect(() => outboxKey({ NODE_ENV: "development", OUTBOX_ENCRYPTION_KEY: "short" })).toThrowError(
      MissingOutboxKeyError,
    );
    expect(outboxKey({ NODE_ENV: "production", OUTBOX_ENCRYPTION_KEY: KEY }).id).toMatch(/^[0-9a-f]{8}$/);
  });

  it("seals a token bound to its link, under its key", () => {
    const key = outboxKey({ NODE_ENV: "test", OUTBOX_ENCRYPTION_KEY: KEY });
    const other = outboxKey({ NODE_ENV: "test", OUTBOX_ENCRYPTION_KEY: "x".repeat(40) });
    const token = "A".repeat(43);
    const sealed = encryptLinkToken(token, "link-1", key);

    expect(sealed).toMatch(/^v1\.[0-9a-f]{8}\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{22}$/);
    expect(sealed).not.toContain(token);
    expect(encryptLinkToken(token, "link-1", key)).not.toBe(sealed); // fresh IV
    expect(decryptLinkToken(sealed, "link-1", key)).toEqual({ ok: true, token });
    // Moved onto another link's message, it does not open.
    expect(decryptLinkToken(sealed, "link-2", key)).toEqual({ ok: false, reason: "corrupt" });
    // Under another key, it is recognized as such.
    expect(decryptLinkToken(sealed, "link-1", other)).toEqual({ ok: false, reason: "other_key" });
    // Tampering is detected.
    const parts = sealed.split(".");
    parts[3] = parts[3].slice(0, -2) + (parts[3].endsWith("AA") ? "BB" : "AA");
    expect(decryptLinkToken(parts.join("."), "link-1", key)).toEqual({ ok: false, reason: "corrupt" });
  });

  it("the database refuses anything but sealed links", async () => {
    const a = await makeAgreement(company, "sent");
    await expect(
      prisma.outboundMessage.create({
        data: {
          documentId: a.id,
          kind: "SIGNING_REQUEST",
          recipientName: "x",
          recipientEmail: "x@test.example",
          subject: "x",
          body: "x",
          signingLinkId: a.linkId,
          linkCiphertext: a.token,
          createdAt: new Date(),
        },
      }),
    ).rejects.toThrowError(/OutboundMessage_link_is_ciphertext/);
  });
});

describe("Google Drive and email providers are not in the product", () => {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const full = path.join(dir, name);
      if (full.includes(`${path.sep}generated`)) return [];
      if (statSync(full).isDirectory()) return walk(full);
      return /\.(ts|tsx|mjs|js)$/.test(name) ? [full] : [];
    });
  const files = ["src", "prisma"].flatMap(walk);

  it("no source file imports Google APIs, Drive, or an email SDK", () => {
    expect(files.length).toBeGreaterThan(20);
    const offenders = files.filter((file) =>
      /from\s+["'](googleapis|@googleapis\/[^"']+|google-auth-library|resend|nodemailer|@sendgrid\/[^"']+|postmark)["']|require\(["'](googleapis|resend|nodemailer)["']\)/.test(
        readFileSync(file, "utf8"),
      ),
    );
    expect(offenders).toEqual([]);
  });

  it("no source file reads Drive or email-provider credentials", () => {
    const offenders = files.filter((file) =>
      /GOOGLE_DRIVE|GOOGLE_OAUTH|RESEND_API_KEY|SENDGRID|SMTP_/.test(readFileSync(file, "utf8")),
    );
    expect(offenders).toEqual([]);
  });

  it("no such dependency is installed by the app", () => {
    const pkg = JSON.parse(readFileSync("package.json", "utf8"));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    expect(
      deps.filter((d) => /^(googleapis|@googleapis\/|google-auth-library|resend|nodemailer|@sendgrid\/|postmark)/.test(d)),
    ).toEqual([]);
  });
});
