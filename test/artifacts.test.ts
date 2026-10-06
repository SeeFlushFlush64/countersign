import { PDFDocument } from "pdf-lib";
import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  countersign,
  generateExecutedArtifact,
  loadAgreementPdf,
} from "@/lib/documents";
import { buildExecutedPdf } from "@/lib/pdf/execution-page";
import { sha256Hex } from "@/lib/hash";
import { ArtifactKind, ArtifactStatus, DocumentStatus } from "@/generated/prisma/enums";
import { expectPrivateEmptyDatabase } from "./harness/private-database";
import { signaturePng } from "../prisma/png-signature";
import {
  COMPANY_SIGNATURE,
  type Company,
  makeAgreement,
  makeCompany,
  stateOf,
} from "./helpers/agreements";

let company: Company;

beforeAll(async () => {
  await expectPrivateEmptyDatabase();
  company = await makeCompany();
});

// PDF bytes are omitted by default (src/lib/prisma.ts); ask for them.
async function artifact(documentId: string, kind: ArtifactKind) {
  return prisma.documentArtifact.findUniqueOrThrow({
    where: { documentId_kind: { documentId, kind } },
    omit: { pdfData: false },
  });
}

describe("freeze at send", () => {
  it("stores the sent PDF with its SHA-256 at send", async () => {
    const a = await makeAgreement(company, "sent");
    const frozen = await artifact(a.id, ArtifactKind.FROZEN);
    const row = await prisma.document.findUniqueOrThrow({ where: { id: a.id } });
    expect(frozen.status).toBe(ArtifactStatus.READY);
    expect(frozen.sha256).toBe(a.frozenSha256);
    expect(row.frozenSha256).toBe(a.frozenSha256);
    expect(sha256Hex(frozen.pdfData!)).toBe(a.frozenSha256);
  });

  it("leaves the frozen bytes untouched through signing and execution", async () => {
    const a = await makeAgreement(company, "executed");
    const frozen = await artifact(a.id, ArtifactKind.FROZEN);
    expect(sha256Hex(frozen.pdfData!)).toBe(a.frozenSha256);
    expect(frozen.sha256).toBe(a.frozenSha256);
  });
});

describe("executed PDF", () => {
  it("is the frozen pages, unchanged, plus one execution page", async () => {
    const a = await makeAgreement(company, "executed");
    const frozen = await artifact(a.id, ArtifactKind.FROZEN);
    const executed = await artifact(a.id, ArtifactKind.EXECUTED);

    expect(executed.status).toBe(ArtifactStatus.READY);
    expect(executed.sha256).toBe(sha256Hex(executed.pdfData!));

    const frozenPdf = await PDFDocument.load(frozen.pdfData!);
    const executedPdf = await PDFDocument.load(executed.pdfData!);
    expect(executedPdf.getPageCount()).toBe(frozenPdf.getPageCount() + 1);
  });

  it("is deterministic, so regeneration is idempotent", async () => {
    const a = await makeAgreement(company, "sent");
    const frozen = await artifact(a.id, ArtifactKind.FROZEN);
    const input = {
      documentId: a.id,
      title: "Determinism",
      frozenPdf: new Uint8Array(frozen.pdfData!),
      frozenSha256: a.frozenSha256,
      counterparty: {
        name: "Counterparty Co",
        detail: "cp@test.example",
        signedAt: new Date("2026-02-01T10:00:00Z"),
        signaturePng: signaturePng("Counterparty Co"),
      },
      company: {
        name: "Sam Signatory",
        detail: "General Counsel, Northlight Media Group",
        signedAt: new Date("2026-02-02T10:00:00Z"),
        signaturePng: signaturePng("Sam Signatory"),
      },
      executedAt: new Date("2026-02-02T10:00:00Z"),
    };
    const first = await buildExecutedPdf(input);
    const second = await buildExecutedPdf(input);
    expect(sha256Hex(second)).toBe(sha256Hex(first));
  });

  it("refuses to stamp a frozen PDF that does not match its recorded hash", async () => {
    const a = await makeAgreement(company, "sent");
    const frozen = await artifact(a.id, ArtifactKind.FROZEN);
    const tampered = new Uint8Array(frozen.pdfData!);
    tampered[tampered.length - 10] ^= 0xff;
    await expect(
      buildExecutedPdf({
        documentId: a.id,
        title: "Tampered",
        frozenPdf: tampered,
        frozenSha256: a.frozenSha256,
        counterparty: { name: "A", detail: "a", signedAt: new Date(), signaturePng: signaturePng("A") },
        company: { name: "B", detail: "b", signedAt: new Date(), signaturePng: signaturePng("B") },
        executedAt: new Date(),
      }),
    ).rejects.toThrowError(/does not match its recorded SHA-256/);
  });
});

describe("failure and recovery (audit: executed agreement left with a stale PDF)", () => {
  it("keeps the execution, records FAILED, and recovers on retry", async () => {
    const a = await makeAgreement(company, "counterpartySigned");

    const result = await countersign(
      a.id,
      { userId: company.signatory.userId },
      { signature: COMPANY_SIGNATURE, expectedSha256: a.frozenSha256 },
      {},
      {
        stamp: async () => {
          throw new Error("simulated PDF failure");
        },
      },
    );

    // The execution itself is committed and consistent.
    expect(result.status).toBe(ArtifactStatus.FAILED);
    const state = await stateOf(a.id);
    expect(state.status).toBe(DocumentStatus.FULLY_EXECUTED);
    expect(state.events).toEqual({ SENT: 1, SIGNED: 2, FULLY_EXECUTED: 1 });

    let executed = await artifact(a.id, ArtifactKind.EXECUTED);
    expect(executed).toMatchObject({
      status: ArtifactStatus.FAILED,
      attempts: 1,
      lastError: "simulated PDF failure",
      pdfData: null,
    });

    // While FAILED, nothing pretends the executed PDF exists...
    // ...until it is retried, which the PDF route does on read.
    const loaded = await loadAgreementPdf(a.id);
    expect(loaded && "pdf" in loaded).toBe(true);
    executed = await artifact(a.id, ArtifactKind.EXECUTED);
    expect(executed.status).toBe(ArtifactStatus.READY);
    expect(executed.attempts).toBe(2);
    expect(executed.lastError).toBeNull();
    expect(sha256Hex((loaded as { pdf: Uint8Array }).pdf)).toBe(executed.sha256);

    // A further retry is a no-op.
    await generateExecutedArtifact(a.id);
    const again = await artifact(a.id, ArtifactKind.EXECUTED);
    expect(again.attempts).toBe(2);
    expect(again.sha256).toBe(executed.sha256);
  });

  it("reports pending (never a stale PDF) while generation keeps failing", async () => {
    const a = await makeAgreement(company, "counterpartySigned");
    await countersign(
      a.id,
      { userId: company.signatory.userId },
      { signature: COMPANY_SIGNATURE, expectedSha256: a.frozenSha256 },
      {},
      { stamp: async () => Promise.reject(new Error("still failing")) },
    );
    const failing = await generateExecutedArtifact(a.id, {
      stamp: async () => Promise.reject(new Error("still failing")),
    });
    expect(failing.status).toBe(ArtifactStatus.FAILED);
    expect((await artifact(a.id, ArtifactKind.EXECUTED)).attempts).toBe(2);
  });

  it("converges to one READY artifact when retries race", async () => {
    const a = await makeAgreement(company, "counterpartySigned");
    await countersign(
      a.id,
      { userId: company.signatory.userId },
      { signature: COMPANY_SIGNATURE, expectedSha256: a.frozenSha256 },
      {},
      { stamp: async () => Promise.reject(new Error("first attempt fails")) },
    );

    const results = await Promise.all(
      Array.from({ length: 5 }, () => generateExecutedArtifact(a.id)),
    );
    expect(new Set(results.map((r) => r.status))).toEqual(new Set([ArtifactStatus.READY]));
    const executed = await artifact(a.id, ArtifactKind.EXECUTED);
    expect(executed.status).toBe(ArtifactStatus.READY);
    expect(sha256Hex(executed.pdfData!)).toBe(executed.sha256);
    expect(
      await prisma.documentArtifact.count({ where: { documentId: a.id, kind: ArtifactKind.EXECUTED } }),
    ).toBe(1);
  });
});

describe("which PDF is served", () => {
  it("serves the draft preview, then the frozen copy, then the executed PDF", async () => {
    const draft = await makeAgreement(company, "draft");
    const preview = await artifact(draft.id, ArtifactKind.PREVIEW);
    const draftPdf = await loadAgreementPdf(draft.id);
    expect(sha256Hex((draftPdf as { pdf: Uint8Array }).pdf)).toBe(preview.sha256);

    const sent = await makeAgreement(company, "sent");
    const sentPdf = await loadAgreementPdf(sent.id);
    expect(sha256Hex((sentPdf as { pdf: Uint8Array }).pdf)).toBe(sent.frozenSha256);

    const executed = await makeAgreement(company, "executed");
    const executedPdf = await loadAgreementPdf(executed.id);
    expect(sha256Hex((executedPdf as { pdf: Uint8Array }).pdf)).toBe(
      (await artifact(executed.id, ArtifactKind.EXECUTED)).sha256,
    );
  });
});
