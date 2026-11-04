import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { linkDisplay } from "@/lib/delivery/outbox";
import { currentEpoch } from "@/lib/demo/epochs";
import { DemoResetConfigError, demoResetConfigProblems, resetDemoNow } from "@/lib/demo/reset-now";
import { expectPrivateEmptyDatabase } from "./harness/private-database";

// `npm run demo:reset` seeds agreements whose outbox messages and signing
// links must work in the deployed app. Its configuration is checked first,
// by production's rules: a missing or invalid value stops it before any
// epoch is claimed, instead of leaving a partial or broken demo behind.

const OUTBOX_KEY = "outbox-secret-value-0123456789abcdefghijklmnop";
const AUDIT_KEY = "audit-secret-value-0123456789abcdefghijklmnopq";
const VALID = { DELIVERY_MODE: "demo-outbox", OUTBOX_ENCRYPTION_KEY: OUTBOX_KEY, AUDIT_IP_HMAC_KEY: AUDIT_KEY };

const env = (overrides: Record<string, string | undefined> = {}) =>
  ({ NODE_ENV: "test", ...VALID, ...overrides }) as NodeJS.ProcessEnv;
const named = (problems: string[]) => problems.map((p) => p.split(":")[0]);

beforeAll(async () => {
  await expectPrivateEmptyDatabase();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the demo reset's configuration check", () => {
  it("accepts a complete, valid configuration", () => {
    expect(demoResetConfigProblems(env())).toEqual([]);
  });

  it.each([
    ["DELIVERY_MODE", { DELIVERY_MODE: undefined }],
    ["DELIVERY_MODE", { DELIVERY_MODE: "sendgrid" }],
    ["OUTBOX_ENCRYPTION_KEY", { OUTBOX_ENCRYPTION_KEY: undefined }],
    ["OUTBOX_ENCRYPTION_KEY", { OUTBOX_ENCRYPTION_KEY: "too-short" }],
    ["AUDIT_IP_HMAC_KEY", { AUDIT_IP_HMAC_KEY: undefined }],
    ["AUDIT_IP_HMAC_KEY", { AUDIT_IP_HMAC_KEY: "too-short" }],
  ])("rejects a missing or invalid %s", (name, overrides) => {
    expect(named(demoResetConfigProblems(env(overrides)))).toEqual([name]);
  });

  it("applies production's rules outside production too: no development fallbacks", () => {
    const empty = { DELIVERY_MODE: undefined, OUTBOX_ENCRYPTION_KEY: undefined, AUDIT_IP_HMAC_KEY: undefined };
    for (const NODE_ENV of ["development", "test", undefined]) {
      expect(named(demoResetConfigProblems(env({ ...empty, NODE_ENV })))).toEqual([
        "DELIVERY_MODE",
        "OUTBOX_ENCRYPTION_KEY",
        "AUDIT_IP_HMAC_KEY",
      ]);
    }
  });

  it("reports every problem at once, by name, without echoing any value", () => {
    const problems = demoResetConfigProblems(
      env({ DELIVERY_MODE: undefined, OUTBOX_ENCRYPTION_KEY: "short-secret", AUDIT_IP_HMAC_KEY: "short-audit" }),
    );
    expect(problems).toHaveLength(3);
    expect(problems.join("\n")).not.toMatch(/short-secret|short-audit/);
  });
});

describe("npm run demo:reset", () => {
  const snapshot = async () => ({
    epochs: await prisma.demoEpoch.findMany({ orderBy: { id: "asc" } }),
    documents: await prisma.document.count(),
    messages: await prisma.outboundMessage.count(),
  });

  it.each([
    ["DELIVERY_MODE", { DELIVERY_MODE: undefined }],
    ["OUTBOX_ENCRYPTION_KEY", { OUTBOX_ENCRYPTION_KEY: undefined }],
    ["AUDIT_IP_HMAC_KEY", { AUDIT_IP_HMAC_KEY: "too-short" }],
  ])("stops before claiming an epoch when %s is wrong", async (name, overrides) => {
    for (const [key, value] of Object.entries({ ...VALID, ...overrides })) vi.stubEnv(key, value);
    const before = await snapshot();

    const failure = await resetDemoNow().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(DemoResetConfigError);
    expect(named((failure as DemoResetConfigError).problems)).toEqual([name]);

    // Nothing claimed, seeded, abandoned or switched.
    expect(await snapshot()).toEqual(before);
  });

  it("resets with a valid configuration, sealing signing links under the configured key", async () => {
    for (const [key, value] of Object.entries(VALID)) vi.stubEnv(key, value);

    const result = await resetDemoNow();
    expect(result.outcome).toBe("reset");
    const epochId = (result as { epochId: number }).epochId;
    expect((await currentEpoch())?.id).toBe(epochId);

    const messages = await prisma.outboundMessage.findMany({
      where: { document: { epochId }, signingLinkId: { not: null }, signingLink: { revokedAt: null } },
      select: { status: true, signingLinkId: true, linkCiphertext: true, signingLink: { select: { revokedAt: true, expiresAt: true } } },
    });
    expect(messages.length).toBeGreaterThan(0);
    expect(messages.every((m) => m.status === "DELIVERED")).toBe(true);
    expect(messages.every((m) => linkDisplay(m, true).state === "active")).toBe(true);
  });
});
