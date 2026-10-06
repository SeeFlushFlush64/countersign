import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createDocument,
  recordLinkView,
  reissueSigningLink,
  voidDocument,
} from "@/lib/documents";
import { hashIp } from "@/lib/hash";
import { auditIpKey, clientIp, MissingAuditKeyError } from "@/lib/request-context";
import { expectPrivateEmptyDatabase } from "./harness/private-database";
import { type Company, makeAgreement, makeCompany } from "./helpers/agreements";

// Audit events are append-only and every new one names a verifiable actor:
// a company user (actorUserId), a link holder (signingLinkId), or the
// system. The database enforces both.

let company: Company;

beforeAll(async () => {
  await expectPrivateEmptyDatabase();
  company = await makeCompany();
});

async function rawWriteError(sql: string, ...params: unknown[]) {
  return prisma.$executeRawUnsafe(sql, ...params).then(
    () => null,
    (e: unknown) => String(e instanceof Error ? `${e.message} ${String(e.cause ?? "")}` : e),
  );
}

describe("actor context", () => {
  it("is recorded for every event across the whole lifecycle", async () => {
    const created = await createDocument({
      senderId: company.paralegal.senderId,
      createdByUserId: company.paralegal.userId,
      countersignerId: company.signatory.userId,
      templateType: "NDA",
      title: "Audit lifecycle",
      counterpartyName: "Counterparty Co",
      counterpartyEmail: "cp@test.example",
    });
    expect(
      await prisma.statusEvent.findFirstOrThrow({ where: { documentId: created.id } }),
    ).toMatchObject({ eventType: "CREATED", actorType: "USER", actorUserId: company.paralegal.userId });

    const a = await makeAgreement(company, "sent");
    await recordLinkView(a.linkId);
    const reissued = await reissueSigningLink(
      a.id,
      { userId: company.signatory.userId },
      { expectedLinkId: a.linkId },
    );
    await voidDocument(a.id, { userId: company.signatory.userId }, "Testing the audit trail");

    const b = await makeAgreement(company, "executed");

    const events = await prisma.statusEvent.findMany({
      where: { documentId: { in: [a.id, b.id] } },
      orderBy: [{ timestamp: "asc" }, { id: "asc" }],
    });
    const summary = events.map((e) => ({
      doc: e.documentId === a.id ? "a" : "b",
      type: e.eventType,
      actorType: e.actorType,
      user: e.actorUserId,
      link: e.signingLinkId,
    }));
    const p = company.paralegal.userId;
    const s = company.signatory.userId;
    expect(summary).toEqual([
      { doc: "a", type: "CREATED", actorType: "SYSTEM", user: null, link: null },
      { doc: "a", type: "SENT", actorType: "USER", user: p, link: a.linkId },
      { doc: "a", type: "VIEWED", actorType: "COUNTERPARTY_LINK", user: null, link: a.linkId },
      { doc: "a", type: "LINK_REISSUED", actorType: "USER", user: s, link: reissued.signingLinkId },
      { doc: "a", type: "VOIDED", actorType: "USER", user: s, link: null },
      { doc: "b", type: "CREATED", actorType: "SYSTEM", user: null, link: null },
      { doc: "b", type: "SENT", actorType: "USER", user: p, link: b.linkId },
      { doc: "b", type: "SIGNED", actorType: "COUNTERPARTY_LINK", user: null, link: b.linkId },
      { doc: "b", type: "SIGNED", actorType: "USER", user: s, link: null },
      { doc: "b", type: "FULLY_EXECUTED", actorType: "SYSTEM", user: null, link: null },
    ]);
    const voided = events.find((e) => e.eventType === "VOIDED")!;
    expect(voided.metadata).toEqual({ reason: "Testing the audit trail", statusBeforeVoid: "SENT" });
  });

  it("refuses a new event without a verifiable actor", async () => {
    const a = await makeAgreement(company, "draft");
    expect(
      await rawWriteError(
        `INSERT INTO "StatusEvent" ("id","documentId","eventType","actor") VALUES ('e1',$1,'SENT','someone')`,
        a.id,
      ),
    ).toMatch(/StatusEvent_actor_context/);
    expect(
      await rawWriteError(
        `INSERT INTO "StatusEvent" ("id","documentId","eventType","actor","actorType") VALUES ('e2',$1,'SENT','someone','USER')`,
        a.id,
      ),
    ).toMatch(/StatusEvent_actor_context/);
    expect(
      await rawWriteError(
        `INSERT INTO "StatusEvent" ("id","documentId","eventType","actor","actorType") VALUES ('e3',$1,'SIGNED','someone','COUNTERPARTY_LINK')`,
        a.id,
      ),
    ).toMatch(/StatusEvent_actor_context/);
  });
});

describe("append-only", () => {
  it("rejects UPDATE and DELETE of any audit event", async () => {
    const a = await makeAgreement(company, "sent");
    expect(
      await rawWriteError(`UPDATE "StatusEvent" SET "actor" = 'rewritten' WHERE "documentId" = $1`, a.id),
    ).toMatch(/append-only/);
    expect(
      await rawWriteError(`DELETE FROM "StatusEvent" WHERE "documentId" = $1`, a.id),
    ).toMatch(/append-only/);
    expect(await prisma.statusEvent.count({ where: { documentId: a.id } })).toBe(2);
  });
});

describe("database rules for links and voiding", () => {
  it("allow only one active link per agreement", async () => {
    const a = await makeAgreement(company, "sent");
    const error = await rawWriteError(
      `INSERT INTO "SigningLink" ("id","documentId","signerId","tokenHash","issuedById","createdAt","expiresAt","activeDocumentId")
       SELECT 'dup', "documentId", "signerId", repeat('a', 64), "issuedById", now(), now() + interval '1 day', "documentId"
       FROM "SigningLink" WHERE "id" = $1`,
      a.linkId,
    );
    expect(error).toMatch(/SigningLink_activeDocumentId_key|unique/i);
  });

  it("keep a link's active marker consistent with its revocation", async () => {
    const a = await makeAgreement(company, "sent");
    expect(
      await rawWriteError(`UPDATE "SigningLink" SET "revokedAt" = now() WHERE "id" = $1`, a.linkId),
    ).toMatch(/SigningLink_active_matches_revocation/);
  });

  it("refuse anything but a SHA-256 hex digest as the stored token", async () => {
    const a = await makeAgreement(company, "sent");
    expect(
      await rawWriteError(
        `UPDATE "SigningLink" SET "tokenHash" = 'raw-token-value-not-a-hash' WHERE "id" = $1`,
        a.linkId,
      ),
    ).toMatch(/SigningLink_token_is_hash/);
  });

  it("keep void metadata and the VOIDED status in lockstep", async () => {
    const sent = await makeAgreement(company, "sent");
    // Metadata without the status…
    expect(
      await rawWriteError(
        `UPDATE "Document" SET "voidedAt" = now(), "voidReason" = 'x', "voidedById" = $2 WHERE "id" = $1`,
        sent.id,
        company.paralegal.userId,
      ),
    ).toMatch(/Document_void_consistency/);
    // …the status without the metadata…
    expect(
      await rawWriteError(`UPDATE "Document" SET "status" = 'VOIDED' WHERE "id" = $1`, sent.id),
    ).toMatch(/Document_void_consistency/);
    // …or a blank reason.
    expect(
      await rawWriteError(
        `UPDATE "Document" SET "status" = 'VOIDED', "voidedAt" = now(), "voidReason" = '   ', "voidedById" = $2 WHERE "id" = $1`,
        sent.id,
        company.paralegal.userId,
      ),
    ).toMatch(/Document_void_consistency/);
  });

  it("make FULLY_EXECUTED and VOIDED terminal", async () => {
    const executed = await makeAgreement(company, "executed");
    expect(
      await rawWriteError(
        `UPDATE "Document" SET "status" = 'VOIDED', "voidedAt" = now(), "voidReason" = 'x', "voidedById" = $2 WHERE "id" = $1`,
        executed.id,
        company.paralegal.userId,
      ),
    ).toMatch(/terminal/);

    const voided = await makeAgreement(company, "sent");
    await voidDocument(voided.id, { userId: company.paralegal.userId }, "Stopping this one");
    expect(
      await rawWriteError(
        `UPDATE "Document" SET "status" = 'SENT', "voidedAt" = NULL, "voidReason" = NULL, "voidedById" = NULL WHERE "id" = $1`,
        voided.id,
      ),
    ).toMatch(/terminal/);
  });

  it("refuse a counterparty signature recorded after a void", async () => {
    const a = await makeAgreement(company, "sent");
    await voidDocument(a.id, { userId: company.paralegal.userId }, "Stopping this one");
    expect(
      await rawWriteError(
        `UPDATE "Document" SET "counterpartySignedAt" = "voidedAt" + interval '1 minute' WHERE "id" = $1`,
        a.id,
      ),
    ).toMatch(/Document_no_signature_after_void/);
  });
});

describe("IP addresses", () => {
  it("are stored only as a keyed hash", () => {
    const a = hashIp("203.0.113.9", "secret-one");
    expect(a).toMatch(/^[0-9a-f]{32}$/);
    expect(a).not.toContain("203.0.113.9");
    expect(hashIp("203.0.113.9", "secret-one")).toBe(a);
    expect(hashIp("203.0.113.9", "secret-two")).not.toBe(a);
    expect(hashIp("203.0.113.9", undefined)).toBeNull();
  });
});

describe("audit IP key", () => {
  const KEY = "k".repeat(32);

  it("is required in production (fail closed)", () => {
    expect(() => auditIpKey({ NODE_ENV: "production" } as NodeJS.ProcessEnv)).toThrowError(
      MissingAuditKeyError,
    );
    expect(() =>
      auditIpKey({ NODE_ENV: "production", AUDIT_IP_HMAC_KEY: "too-short" } as NodeJS.ProcessEnv),
    ).toThrowError(MissingAuditKeyError);
    expect(auditIpKey({ NODE_ENV: "production", AUDIT_IP_HMAC_KEY: KEY } as NodeJS.ProcessEnv)).toBe(KEY);
  });

  it("is optional outside production, where no IP is recorded at all", () => {
    expect(auditIpKey({ NODE_ENV: "test" } as NodeJS.ProcessEnv)).toBeUndefined();
    expect(hashIp("203.0.113.9", auditIpKey({ NODE_ENV: "test" } as NodeJS.ProcessEnv))).toBeNull();
  });

  it("prefers the proxy-set headers over client-supplied x-forwarded-for", () => {
    expect(
      clientIp(
        new Headers({
          "x-forwarded-for": "198.51.100.1, 10.0.0.1",
          "x-real-ip": "203.0.113.5",
          "x-vercel-forwarded-for": "203.0.113.9",
        }),
      ),
    ).toBe("203.0.113.9");
    expect(clientIp(new Headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.1", "x-real-ip": "203.0.113.5" }))).toBe(
      "203.0.113.5",
    );
    expect(clientIp(new Headers({ "x-forwarded-for": "198.51.100.1, 10.0.0.1" }))).toBe("198.51.100.1");
    expect(clientIp(new Headers())).toBe("");
  });
});
