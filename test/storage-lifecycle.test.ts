import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createDocument,
  generatePreviewArtifact,
  loadAgreementPdf,
  loadLinkPdf,
  sendDocument,
} from "@/lib/documents";
import { sha256Hex } from "@/lib/hash";
import { ArtifactKind, ArtifactStatus, DocumentStatus } from "@/generated/prisma/enums";
import { expectPrivateEmptyDatabase } from "./harness/private-database";
import { type Company, makeAgreement, makeCompany, stateOf } from "./helpers/agreements";

// Phase D: every PDF is a DocumentArtifact (PREVIEW, FROZEN, EXECUTED) with
// its SHA-256. Derived PDFs fail and recover without touching the agreement,
// and a READY artifact can never change.

let company: Company;

beforeAll(async () => {
  await expectPrivateEmptyDatabase();
  company = await makeCompany();
});

const manager = () => ({ userId: company.paralegal.userId });

async function artifact(documentId: string, kind: ArtifactKind) {
  return prisma.documentArtifact.findUniqueOrThrow({
    where: { documentId_kind: { documentId, kind } },
    omit: { pdfData: false },
  });
}

function newDraft(render?: (id: string) => Promise<Uint8Array>) {
  return createDocument(
    {
      senderId: company.paralegal.senderId,
      countersignerId: company.signatory.userId,
      templateType: "NDA",
      title: "Storage test",
      counterpartyName: "Counterparty Co",
      counterpartyEmail: "cp@test.example",
    },
    {},
    render ? { render } : {},
  );
}

const failingRender = async (): Promise<Uint8Array> => {
  throw new Error("simulated renderer crash");
};

describe("draft previews are artifacts", () => {
  it("stores the preview as a READY PREVIEW artifact with its hash, not on the agreement row", async () => {
    const draft = await newDraft();
    const preview = await artifact(draft.id, ArtifactKind.PREVIEW);
    expect(preview.status).toBe(ArtifactStatus.READY);
    expect(preview.sha256).toBe(sha256Hex(preview.pdfData!));

    const legacy = await prisma.$queryRaw<{ pdfData: Buffer | null; pdfUrl: string | null }[]>`
      SELECT "pdfData", "pdfUrl" FROM "Document" WHERE "id" = ${draft.id}`;
    expect(legacy[0]).toEqual({ pdfData: null, pdfUrl: null });

    const served = await loadAgreementPdf(draft.id);
    expect(sha256Hex((served as { pdf: Uint8Array }).pdf)).toBe(preview.sha256);
  });

  it("a failed preview leaves the agreement intact and recovers when opened", async () => {
    const draft = await newDraft(failingRender);
    expect((await stateOf(draft.id)).status).toBe(DocumentStatus.DRAFT);
    let preview = await artifact(draft.id, ArtifactKind.PREVIEW);
    expect(preview).toMatchObject({
      status: ArtifactStatus.FAILED,
      attempts: 1,
      lastError: "simulated renderer crash",
      pdfData: null,
      sha256: null,
    });

    // Still failing: reported as pending, never as some other PDF.
    expect(await loadAgreementPdf(draft.id, { render: failingRender })).toEqual({ pending: true });
    expect((await artifact(draft.id, ArtifactKind.PREVIEW)).attempts).toBe(2);

    // The next open succeeds.
    const served = await loadAgreementPdf(draft.id);
    preview = await artifact(draft.id, ArtifactKind.PREVIEW);
    expect(preview).toMatchObject({ status: ArtifactStatus.READY, attempts: 3, lastError: null });
    expect(sha256Hex((served as { pdf: Uint8Array }).pdf)).toBe(preview.sha256);

    // Further generation is a no-op.
    await generatePreviewArtifact(draft.id);
    expect((await artifact(draft.id, ArtifactKind.PREVIEW)).attempts).toBe(3);
  });

  it("a failed preview does not block sending; the frozen copy is rendered on its own", async () => {
    const draft = await newDraft(failingRender);
    const sent = await sendDocument(draft.id, manager());
    const frozen = await artifact(draft.id, ArtifactKind.FROZEN);
    expect(frozen.status).toBe(ArtifactStatus.READY);
    expect(sha256Hex(frozen.pdfData!)).toBe(sent.frozenSha256);
    // Once sent, the company sees the frozen copy (the preview is not retried).
    const served = await loadAgreementPdf(draft.id, { render: failingRender });
    expect(sha256Hex((served as { pdf: Uint8Array }).pdf)).toBe(sent.frozenSha256);
  });

  it("concurrent preview retries converge on one READY artifact", async () => {
    const draft = await newDraft(failingRender);
    const results = await Promise.all(Array.from({ length: 4 }, () => generatePreviewArtifact(draft.id)));
    expect(new Set(results.map((r) => r.status))).toEqual(new Set([ArtifactStatus.READY]));
    const preview = await artifact(draft.id, ArtifactKind.PREVIEW);
    expect(sha256Hex(preview.pdfData!)).toBe(preview.sha256);
    expect(await prisma.documentArtifact.count({ where: { documentId: draft.id, kind: "PREVIEW" } })).toBe(1);
  });
});

describe("what each party is served", () => {
  it("a signing link never serves a preview, and hashes match on every read", async () => {
    const a = await makeAgreement(company, "sent");
    const viaLink = await loadLinkPdf(a.token);
    expect(sha256Hex((viaLink as { pdf: Uint8Array }).pdf)).toBe(a.frozenSha256);
    const viaCompany = await loadAgreementPdf(a.id);
    expect(sha256Hex((viaCompany as { pdf: Uint8Array }).pdf)).toBe(a.frozenSha256);

    const executed = await makeAgreement(company, "executed");
    const executedArtifact = await artifact(executed.id, ArtifactKind.EXECUTED);
    for (const loaded of [await loadLinkPdf(executed.token), await loadAgreementPdf(executed.id)]) {
      expect(sha256Hex((loaded as { pdf: Uint8Array }).pdf)).toBe(executedArtifact.sha256);
    }
  });
});

describe("the database keeps artifacts honest", () => {
  it("a READY artifact cannot be changed or deleted", async () => {
    const a = await makeAgreement(company, "sent");
    const frozen = await artifact(a.id, ArtifactKind.FROZEN);
    const attempts = [
      prisma.$executeRaw`UPDATE "DocumentArtifact" SET "pdfData" = '\\x00'::bytea, "sha256" = encode(sha256('\\x00'::bytea), 'hex') WHERE "id" = ${frozen.id}`,
      prisma.$executeRaw`UPDATE "DocumentArtifact" SET "status" = 'FAILED', "pdfData" = NULL, "sha256" = NULL, "lastError" = 'x' WHERE "id" = ${frozen.id}`,
      prisma.$executeRaw`UPDATE "DocumentArtifact" SET "lastError" = 'x' WHERE "id" = ${frozen.id}`,
      prisma.$executeRaw`DELETE FROM "DocumentArtifact" WHERE "id" = ${frozen.id}`,
    ];
    for (const attempt of attempts) {
      await expect(attempt).rejects.toThrowError(/READY and immutable/);
    }
    const after = await artifact(a.id, ArtifactKind.FROZEN);
    expect(after.sha256).toBe(a.frozenSha256);
    expect(sha256Hex(after.pdfData!)).toBe(a.frozenSha256);
  });

  it("a stored hash must be the hash of the stored bytes", async () => {
    const draft = await newDraft(failingRender);
    await expect(
      prisma.$executeRaw`UPDATE "DocumentArtifact" SET "status" = 'READY', "pdfData" = '\\x01'::bytea, "sha256" = ${"0".repeat(64)} WHERE "documentId" = ${draft.id}`,
    ).rejects.toThrowError(/DocumentArtifact_sha256_matches_bytes/);
  });

  it("only a READY artifact carries bytes", async () => {
    const draft = await newDraft(failingRender);
    await expect(
      prisma.$executeRaw`UPDATE "DocumentArtifact" SET "pdfData" = '\\x01'::bytea WHERE "documentId" = ${draft.id}`,
    ).rejects.toThrowError(/DocumentArtifact_bytes_only_when_ready/);
  });
});
