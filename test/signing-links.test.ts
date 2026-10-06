import { beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  countersign,
  DocumentFlowError,
  REISSUE_CONFLICT_MESSAGE,
  loadLinkPdf,
  recordLinkView,
  reissueSigningLink,
  resolveSigningLink,
  sendDocument,
  signWithLink,
  voidDocument,
} from "@/lib/documents";
import {
  hashSigningToken,
  RECEIPT_WINDOW_DAYS,
  SIGNING_LINK_TTL_DAYS,
} from "@/lib/signing-links";
import { sha256Hex } from "@/lib/hash";
import { DocumentStatus } from "@/generated/prisma/enums";
import { expectPrivateEmptyDatabase } from "./harness/private-database";
import {
  COMPANY_SIGNATURE,
  COUNTERPARTY_SIGNATURE,
  type Company,
  makeAgreement,
  makeCompany,
  stateOf,
} from "./helpers/agreements";

// The action module imports the session helper; nothing here is signed in.
vi.mock("@/auth", () => ({ auth: async () => null }));

// Phase C: the counterparty's signing link is a hashed, expiring,
// single-agreement credential that can be superseded or voided.

const DAY = 24 * 60 * 60 * 1000;
let company: Company;

beforeAll(async () => {
  await expectPrivateEmptyDatabase();
  company = await makeCompany();
});

const manager = () => ({ userId: company.paralegal.userId });
const activeLinkId = async (documentId: string) =>
  (await prisma.signingLink.findUnique({ where: { activeDocumentId: documentId }, select: { id: true } }))?.id ??
  null;
const sign = (token: string, sha: string, clock = {}) =>
  signWithLink(token, { signature: COUNTERPARTY_SIGNATURE, expectedSha256: sha }, {}, clock);

async function flowError(promise: Promise<unknown>) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DocumentFlowError);
  return error as DocumentFlowError;
}

describe("token storage", () => {
  it("stores only a SHA-256 of a 256-bit random token", async () => {
    const a = await makeAgreement(company, "sent");
    expect(a.token).toMatch(/^[A-Za-z0-9_-]{43}$/);

    const link = await prisma.signingLink.findUniqueOrThrow({ where: { id: a.linkId } });
    expect(link.tokenHash).toBe(hashSigningToken(a.token));
    expect(link.tokenHash).toBe(sha256Hex(new TextEncoder().encode(a.token)));

    // The raw token appears nowhere in the database.
    const rows = await prisma.$queryRaw<{ hits: number }[]>`
      SELECT (
        (SELECT count(*) FROM "SigningLink" l WHERE l::text LIKE ${"%" + a.token + "%"}) +
        (SELECT count(*) FROM "StatusEvent" e WHERE e::text LIKE ${"%" + a.token + "%"}) +
        (SELECT count(*) FROM "Document" d WHERE d.id || d.title || coalesce(d."voidReason", '') LIKE ${"%" + a.token + "%"})
      )::int AS hits`;
    expect(rows[0].hits).toBe(0);
  });

  it("gives every agreement and every issue a different token", async () => {
    const a = await makeAgreement(company, "sent");
    const b = await makeAgreement(company, "sent");
    const reissued = await reissueSigningLink(a.id, manager(), { expectedLinkId: a.linkId });
    expect(new Set([a.token, b.token, reissued.signingToken]).size).toBe(3);
  });
});

describe("valid and reused links", () => {
  it("signs once; afterwards the link is read-only", async () => {
    const a = await makeAgreement(company, "sent");
    expect((await resolveSigningLink(a.token)).state).toBe("valid");

    await sign(a.token, a.frozenSha256);
    const link = await prisma.signingLink.findUniqueOrThrow({ where: { id: a.linkId } });
    expect(link.usedAt).not.toBeNull();

    // Reusing the link to sign again is refused…
    expect((await flowError(sign(a.token, a.frozenSha256))).message).toMatch(
      /no longer awaiting your signature/,
    );
    expect((await stateOf(a.id)).events.SIGNED).toBe(1);
    // …but the holder can still see the agreement's status and document.
    expect((await resolveSigningLink(a.token)).state).toBe("valid");
    expect(await loadLinkPdf(a.token)).not.toBeNull();
  });

  it("only ever acts on its own agreement", async () => {
    const a = await makeAgreement(company, "sent");
    const b = await makeAgreement(company, "sent");
    // A's token with B's document hash cannot sign anything.
    await flowError(sign(a.token, b.frozenSha256));
    expect((await stateOf(a.id)).status).toBe(DocumentStatus.SENT);
    expect((await stateOf(b.id)).status).toBe(DocumentStatus.SENT);

    const view = await resolveSigningLink(a.token);
    expect(view.state === "valid" && view.document.id).toBe(a.id);
  });

  it.each([
    ["an empty string", ""],
    ["a short string", "abc"],
    ["the right length with invalid characters", "!".repeat(43)],
    ["a SQL-looking string", "' OR 1=1 --".padEnd(43, "x")],
    ["a random well-formed token", "A".repeat(43)],
    ["a non-string", 42],
  ])("treats %s as an unknown link", async (_label, token) => {
    expect((await resolveSigningLink(token)).state).toBe("not_found");
    expect((await flowError(sign(token as string, "0".repeat(64)))).code).toBe("LINK_INVALID");
  });
});

describe("expiry", () => {
  it(`expires ${SIGNING_LINK_TTL_DAYS} days after issue`, async () => {
    const t0 = new Date("2026-04-01T09:00:00Z");
    const a = await makeAgreement(company, "draft");
    const { signingToken, frozenSha256 } = await sendDocument(a.id, manager(), { now: t0 });

    const justBefore = new Date(t0.getTime() + SIGNING_LINK_TTL_DAYS * DAY - 1000);
    const atExpiry = new Date(t0.getTime() + SIGNING_LINK_TTL_DAYS * DAY);
    expect((await resolveSigningLink(signingToken, justBefore)).state).toBe("valid");
    expect((await resolveSigningLink(signingToken, atExpiry)).state).toBe("expired");

    const error = await flowError(sign(signingToken, frozenSha256, { now: atExpiry }));
    expect(error.code).toBe("LINK_INVALID");
    expect(error.message).toMatch(/expired/);
    expect((await stateOf(a.id)).status).toBe(DocumentStatus.SENT);
    expect(await loadLinkPdf(signingToken, atExpiry)).toBeNull();

    // The sender recovers by reissuing.
    const fresh = await reissueSigningLink(
      a.id,
      manager(),
      { expectedLinkId: await activeLinkId(a.id) },
      { now: atExpiry },
    );
    await sign(fresh.signingToken, frozenSha256, { now: new Date(atExpiry.getTime() + 1000) });
    expect((await stateOf(a.id)).status).toBe(DocumentStatus.PARTIALLY_SIGNED);
  });

  it(`keeps the link readable for ${RECEIPT_WINDOW_DAYS} days after execution`, async () => {
    const t0 = new Date("2026-05-01T09:00:00Z");
    const a = await makeAgreement(company, "draft");
    const { signingToken, frozenSha256 } = await sendDocument(a.id, manager(), { now: t0 });
    await sign(signingToken, frozenSha256, { now: new Date(t0.getTime() + DAY) });
    const executedAt = new Date(t0.getTime() + 13 * DAY);
    await countersign(
      a.id,
      { userId: company.signatory.userId },
      { signature: COMPANY_SIGNATURE, expectedSha256: frozenSha256 },
      { now: executedAt },
    );

    const link = await prisma.signingLink.findUniqueOrThrow({
      where: { tokenHash: hashSigningToken(signingToken) },
    });
    expect(link.expiresAt).toEqual(new Date(executedAt.getTime() + RECEIPT_WINDOW_DAYS * DAY));

    const later = new Date(executedAt.getTime() + 20 * DAY); // past the original expiry
    const executed = await loadLinkPdf(signingToken, later);
    const artifact = await prisma.documentArtifact.findFirstOrThrow({
      where: { documentId: a.id, kind: "EXECUTED" },
    });
    expect(executed && "pdf" in executed && sha256Hex(executed.pdf)).toBe(artifact.sha256);
    expect(await loadLinkPdf(signingToken, link.expiresAt)).toBeNull();
  });
});

describe("reissue (superseding)", () => {
  it("disables the old link immediately and leaves exactly one active link", async () => {
    const a = await makeAgreement(company, "sent");
    const reissued = await reissueSigningLink(a.id, manager(), { expectedLinkId: a.linkId });

    expect((await resolveSigningLink(a.token)).state).toBe("superseded");
    const error = await flowError(sign(a.token, a.frozenSha256));
    expect(error.message).toMatch(/replaced by a newer one/);
    expect(await loadLinkPdf(a.token)).toBeNull();

    const links = await prisma.signingLink.findMany({
      where: { documentId: a.id },
      orderBy: { createdAt: "asc" },
    });
    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({
      revokedReason: "SUPERSEDED",
      activeDocumentId: null,
      replacedById: reissued.signingLinkId,
    });
    expect(links[1]).toMatchObject({ id: reissued.signingLinkId, revokedAt: null, activeDocumentId: a.id });

    await sign(reissued.signingToken, a.frozenSha256);
    expect((await stateOf(a.id)).status).toBe(DocumentStatus.PARTIALLY_SIGNED);
  });

  it("is refused once the counterparty has signed, or for a non-manager", async () => {
    const signed = await makeAgreement(company, "counterpartySigned");
    expect((await flowError(reissueSigningLink(signed.id, manager(), { expectedLinkId: signed.linkId }))).message).toMatch(
      /only be reissued while waiting on the counterparty/,
    );

    const sent = await makeAgreement(company, "sent");
    expect((await flowError(reissueSigningLink(sent.id, { userId: company.otherSignatory.userId }, { expectedLinkId: sent.linkId }))).code).toBe(
      "FORBIDDEN",
    );
    expect((await resolveSigningLink(sent.token)).state).toBe("valid");
  });

  it("has exactly one winner when the same link is reissued concurrently (double-click)", async () => {
    const a = await makeAgreement(company, "sent");
    const results = await Promise.allSettled(
      Array.from({ length: 6 }, () =>
        reissueSigningLink(a.id, manager(), { expectedLinkId: a.linkId }),
      ),
    );
    const winners = results.filter((r) => r.status === "fulfilled");
    const losers = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");
    expect(winners).toHaveLength(1);
    // Every loser is a clean conflict, never a raw database error.
    for (const loser of losers) {
      expect(loser.reason).toBeInstanceOf(DocumentFlowError);
      expect((loser.reason as Error).message).toBe(REISSUE_CONFLICT_MESSAGE);
    }

    // One logical transition: one new link, one LINK_REISSUED event.
    expect(await prisma.signingLink.count({ where: { documentId: a.id } })).toBe(2);
    expect(await prisma.signingLink.count({ where: { documentId: a.id, revokedAt: null } })).toBe(1);
    expect(
      await prisma.statusEvent.count({ where: { documentId: a.id, eventType: "LINK_REISSUED" } }),
    ).toBe(1);
    const winner = (winners[0] as PromiseFulfilledResult<{ signingToken: string; signingLinkId: string }>).value;
    expect(await activeLinkId(a.id)).toBe(winner.signingLinkId);
    expect((await resolveSigningLink(winner.signingToken)).state).toBe("valid");
    expect((await resolveSigningLink(a.token)).state).toBe("superseded");
  });

  it("refuses a reissue based on a stale view of the current link", async () => {
    const a = await makeAgreement(company, "sent");
    await reissueSigningLink(a.id, manager(), { expectedLinkId: a.linkId });
    // A second tab still showing the original link:
    expect((await flowError(reissueSigningLink(a.id, manager(), { expectedLinkId: a.linkId }))).message).toBe(
      REISSUE_CONFLICT_MESSAGE,
    );
    // Claiming there is no link when there is one is equally stale:
    await flowError(reissueSigningLink(a.id, manager(), { expectedLinkId: null }));
    expect(await prisma.signingLink.count({ where: { documentId: a.id } })).toBe(2);
  });

  it("issues exactly one link when an agreement without one is reissued concurrently", async () => {
    const a = await makeAgreement(company, "sent");
    // An agreement sent before links existed has no active link (simulated by
    // retiring the current one directly).
    await prisma.signingLink.update({
      where: { id: a.linkId },
      data: { revokedAt: new Date(), revokedReason: "SUPERSEDED", activeDocumentId: null },
    });
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => reissueSigningLink(a.id, manager(), { expectedLinkId: null })),
    );
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    for (const r of results) {
      if (r.status === "rejected") expect(r.reason).toBeInstanceOf(DocumentFlowError);
    }
    expect(await prisma.signingLink.count({ where: { documentId: a.id, revokedAt: null } })).toBe(1);
    expect(
      await prisma.statusEvent.count({ where: { documentId: a.id, eventType: "LINK_REISSUED" } }),
    ).toBe(1);
  });

  it("never lets a superseded link sign, even racing the reissue", async () => {
    for (let round = 0; round < 4; round++) {
      const a = await makeAgreement(company, "sent");
      const [signResult, reissueResult] = await Promise.allSettled([
        sign(a.token, a.frozenSha256),
        reissueSigningLink(a.id, manager(), { expectedLinkId: a.linkId }),
      ]);
      // Exactly one of them happened.
      expect([signResult.status, reissueResult.status].sort()).toEqual(["fulfilled", "rejected"]);
      const state = await stateOf(a.id);
      const oldLink = await prisma.signingLink.findUniqueOrThrow({ where: { id: a.linkId } });
      if (signResult.status === "fulfilled") {
        expect(state.status).toBe(DocumentStatus.PARTIALLY_SIGNED);
        expect(oldLink.revokedAt).toBeNull();
      } else {
        expect(state.status).toBe(DocumentStatus.SENT);
        expect(oldLink.revokedReason).toBe("SUPERSEDED");
      }
    }
  });
});

describe("void", () => {
  it("requires a real reason", async () => {
    const a = await makeAgreement(company, "sent");
    for (const reason of [undefined, "", "   ", "\n\t", "ok", "x".repeat(501)]) {
      expect((await flowError(voidDocument(a.id, manager(), reason))).code).toBe("INVALID");
    }
    expect((await stateOf(a.id)).status).toBe(DocumentStatus.SENT);
  });

  it("revokes the link and blocks every further step", async () => {
    const a = await makeAgreement(company, "counterpartySigned");
    await voidDocument(a.id, manager(), "  Wrong counterparty entity —  resending  ");

    const row = await prisma.document.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.voidReason).toBe("Wrong counterparty entity — resending");
    expect(row.voidedById).toBe(company.paralegal.userId);
    expect(row.status).toBe(DocumentStatus.VOIDED);
    // The signing history from before the void is kept.
    expect(row.counterpartySignedAt).not.toBeNull();
    const voidEvent = await prisma.statusEvent.findFirstOrThrow({
      where: { documentId: a.id, eventType: "VOIDED" },
    });
    expect(voidEvent.metadata).toEqual({
      reason: "Wrong counterparty entity — resending",
      statusBeforeVoid: "PARTIALLY_SIGNED",
    });

    expect((await resolveSigningLink(a.token)).state).toBe("voided");
    expect(await loadLinkPdf(a.token)).toBeNull();
    const link = await prisma.signingLink.findUniqueOrThrow({ where: { id: a.linkId } });
    expect(link).toMatchObject({ revokedReason: "VOIDED", activeDocumentId: null });

    expect(
      (
        await flowError(
          countersign(a.id, { userId: company.signatory.userId }, {
            signature: COMPANY_SIGNATURE,
            expectedSha256: a.frozenSha256,
          }),
        )
      ).message,
    ).toMatch(/voided/);
    await flowError(voidDocument(a.id, manager(), "again please"));
  });

  it("stops a voided draft from being sent, and a voided sent agreement from being signed or reissued", async () => {
    const draft = await makeAgreement(company, "draft");
    await voidDocument(draft.id, manager(), "Not needed any more");
    expect((await flowError(sendDocument(draft.id, manager()))).message).toMatch(/voided/);

    const sent = await makeAgreement(company, "sent");
    await voidDocument(sent.id, manager(), "Superseded by a new agreement");
    expect((await flowError(sign(sent.token, sent.frozenSha256))).message).toMatch(/voided/);
    expect((await flowError(reissueSigningLink(sent.id, manager(), { expectedLinkId: null }))).message).toMatch(/voided/);
  });

  it("cannot void an executed agreement", async () => {
    const a = await makeAgreement(company, "executed");
    expect((await flowError(voidDocument(a.id, manager(), "Too late"))).message).toMatch(
      /executed agreement cannot be voided/,
    );
  });

  it("has exactly one outcome when void races the countersignature", async () => {
    for (let round = 0; round < 4; round++) {
      const a = await makeAgreement(company, "counterpartySigned");
      const [voidResult, countersignResult] = await Promise.allSettled([
        voidDocument(a.id, manager(), "Racing the countersignature"),
        countersign(a.id, { userId: company.signatory.userId }, {
          signature: COMPANY_SIGNATURE,
          expectedSha256: a.frozenSha256,
        }),
      ]);
      expect([voidResult.status, countersignResult.status].sort()).toEqual(["fulfilled", "rejected"]);
      const row = await prisma.document.findUniqueOrThrow({ where: { id: a.id } });
      if (voidResult.status === "fulfilled") {
        expect(row.status).toBe(DocumentStatus.VOIDED);
        expect(row.countersignedAt).toBeNull();
      } else {
        expect(row.status).toBe(DocumentStatus.FULLY_EXECUTED);
        expect(row.voidedAt).toBeNull();
      }
    }
  });
});

describe("views", () => {
  it("are recorded on the server once per link, never for revoked links", async () => {
    const a = await makeAgreement(company, "sent");
    expect(await recordLinkView(a.linkId, { ipHash: "h", userAgent: "ua" })).toBe(true);
    expect(await recordLinkView(a.linkId)).toBe(false);
    const views = await prisma.statusEvent.findMany({
      where: { documentId: a.id, eventType: "VIEWED" },
    });
    expect(views).toHaveLength(1);
    expect(views[0]).toMatchObject({ actorType: "COUNTERPARTY_LINK", signingLinkId: a.linkId });

    const b = await makeAgreement(company, "sent");
    await reissueSigningLink(b.id, manager(), { expectedLinkId: b.linkId });
    expect(await recordLinkView(b.linkId)).toBe(false); // superseded link
  });

  it("cannot be forged through a public action", async () => {
    const actions = await import("@/app/s/[token]/actions");
    expect(Object.keys(actions).sort()).toEqual(["signLinkAction"]);
  });
});
