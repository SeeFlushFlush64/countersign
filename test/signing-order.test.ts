import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  createDocument,
  DocumentFlowError,
  sendDocument,
  signAsSigner,
} from "@/lib/documents";
import { DocumentStatus, PartyRole, Role } from "@/generated/prisma/enums";
import { expectPrivateEmptyDatabase } from "./harness/private-database";

// Characterization tests for the signing-order guard as it exists before the
// Phase B rebuild: sequential behaviour only. Concurrency, authorization and
// renderer-security regressions are Phase B's suite.

// A 1×1 transparent PNG.
const SIGNATURE =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";

let senderId: string;

beforeAll(async () => {
  await expectPrivateEmptyDatabase();
  const sender = await prisma.sender.create({
    data: { name: "Test Sender", email: "sender@test.example", role: Role.GENERAL_COUNSEL },
  });
  senderId = sender.id;
});

async function newAgreement(send = true) {
  const document = await createDocument({
    senderId,
    templateType: "NDA",
    title: "Signing order test",
    counterpartyName: "Counterparty Co",
    counterpartyEmail: "cp@test.example",
  });
  if (send) await sendDocument(document.id);
  const signers = await prisma.signer.findMany({ where: { documentId: document.id } });
  return {
    id: document.id,
    company: signers.find((s) => s.partyRole === PartyRole.COMPANY)!.id,
    counterparty: signers.find((s) => s.partyRole === PartyRole.COUNTERPARTY)!.id,
  };
}

async function statusOf(id: string) {
  return (await prisma.document.findUniqueOrThrow({ where: { id } })).status;
}

describe("signing order (sequential)", () => {
  it("refuses a company signature before the counterparty has signed", async () => {
    const a = await newAgreement();
    await expect(signAsSigner(a.company, SIGNATURE)).rejects.toThrowError(
      new DocumentFlowError("The counterparty must sign before the company can countersign."),
    );
    expect(await statusOf(a.id)).toBe(DocumentStatus.SENT);
    const company = await prisma.signer.findUniqueOrThrow({ where: { id: a.company } });
    expect(company.signedAt).toBeNull();
  });

  it("executes when the counterparty signs first and the company countersigns", async () => {
    const a = await newAgreement();

    await signAsSigner(a.counterparty, SIGNATURE);
    expect(await statusOf(a.id)).toBe(DocumentStatus.PARTIALLY_SIGNED);

    await signAsSigner(a.company, SIGNATURE);
    const document = await prisma.document.findUniqueOrThrow({ where: { id: a.id } });
    expect(document.status).toBe(DocumentStatus.FULLY_EXECUTED);
    expect(document.completedAt).not.toBeNull();
    expect(document.pdfData?.length ?? 0).toBeGreaterThan(0);
  });

  it("refuses a second signature from the same party", async () => {
    const a = await newAgreement();
    await signAsSigner(a.counterparty, SIGNATURE);
    await expect(signAsSigner(a.counterparty, SIGNATURE)).rejects.toThrowError(
      DocumentFlowError,
    );
  });

  it("refuses any signature on a draft or an executed agreement", async () => {
    const draft = await newAgreement(false);
    await expect(signAsSigner(draft.counterparty, SIGNATURE)).rejects.toThrowError(
      DocumentFlowError,
    );

    const executed = await newAgreement();
    await signAsSigner(executed.counterparty, SIGNATURE);
    await signAsSigner(executed.company, SIGNATURE);
    await expect(signAsSigner(executed.company, SIGNATURE)).rejects.toThrowError(
      DocumentFlowError,
    );
    await expect(sendDocument(executed.id)).rejects.toThrowError(DocumentFlowError);
  });

  it("stamps every step with the injected clock", async () => {
    const t0 = new Date("2026-01-05T09:00:00.000Z");
    const t1 = new Date("2026-01-05T09:15:00.000Z");
    const document = await createDocument(
      {
        senderId,
        templateType: "NDA",
        title: "Clock test",
        counterpartyName: "Counterparty Co",
        counterpartyEmail: "cp@test.example",
      },
      { now: t0 },
    );
    await sendDocument(document.id, { now: t1 });

    const row = await prisma.document.findUniqueOrThrow({
      where: { id: document.id },
      include: { statusEvents: { orderBy: { timestamp: "asc" } } },
    });
    expect(row.createdAt).toEqual(t0);
    expect(row.sentAt).toEqual(t1);
    expect(row.statusEvents.map((e) => [e.eventType, e.timestamp])).toEqual([
      ["CREATED", t0],
      ["SENT", t1],
    ]);
  });
});
