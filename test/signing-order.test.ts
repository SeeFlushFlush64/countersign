import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  countersign,
  createDocument,
  DocumentFlowError,
  ORDER_VIOLATION_MESSAGE,
  sendDocument,
  signAsCounterparty,
} from "@/lib/documents";
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

// The product's invariant, step by step (one request at a time). Concurrent
// attempts are in concurrency.test.ts; who may countersign is in
// authorization.test.ts.

let company: Company;

beforeAll(async () => {
  await expectPrivateEmptyDatabase();
  company = await makeCompany();
});

const asSignatory = () => ({ userId: company.signatory.userId });

describe("signing order", () => {
  it("refuses the company countersignature before the counterparty signs", async () => {
    const a = await makeAgreement(company, "sent");

    await expect(
      countersign(a.id, asSignatory(), {
        signature: COMPANY_SIGNATURE,
        expectedSha256: a.frozenSha256,
      }),
    ).rejects.toThrowError(new DocumentFlowError(ORDER_VIOLATION_MESSAGE));

    const state = await stateOf(a.id);
    expect(state.status).toBe(DocumentStatus.SENT);
    expect(state.countersignedAt).toBeNull();
    expect(state.signerSignedAt.COMPANY).toBeNull();
    expect(state.events.SIGNED).toBe(0);
  });

  it("executes when the counterparty signs first and the signatory countersigns", async () => {
    const a = await makeAgreement(company, "sent");

    await signAsCounterparty(a.counterpartySignerId, {
      signature: COUNTERPARTY_SIGNATURE,
      expectedSha256: a.frozenSha256,
    });
    let state = await stateOf(a.id);
    expect(state.status).toBe(DocumentStatus.PARTIALLY_SIGNED);
    expect(state.counterpartySignedAt).not.toBeNull();
    expect(state.signerSignedAt.COUNTERPARTY).toEqual(state.counterpartySignedAt);

    const artifact = await countersign(a.id, asSignatory(), {
      signature: COMPANY_SIGNATURE,
      expectedSha256: a.frozenSha256,
    });
    expect(artifact.status).toBe("READY");

    state = await stateOf(a.id);
    expect(state.status).toBe(DocumentStatus.FULLY_EXECUTED);
    expect(state.countersignedAt!.getTime()).toBeGreaterThanOrEqual(
      state.counterpartySignedAt!.getTime(),
    );
    expect(state.completedAt).toEqual(state.countersignedAt);
    expect(state.events).toEqual({ SENT: 1, SIGNED: 2, FULLY_EXECUTED: 1 });
  });

  it("refuses a second counterparty signature and a second countersignature", async () => {
    const a = await makeAgreement(company, "counterpartySigned");
    await expect(
      signAsCounterparty(a.counterpartySignerId, {
        signature: COUNTERPARTY_SIGNATURE,
        expectedSha256: a.frozenSha256,
      }),
    ).rejects.toThrowError(DocumentFlowError);

    await countersign(a.id, asSignatory(), {
      signature: COMPANY_SIGNATURE,
      expectedSha256: a.frozenSha256,
    });
    await expect(
      countersign(a.id, asSignatory(), {
        signature: COMPANY_SIGNATURE,
        expectedSha256: a.frozenSha256,
      }),
    ).rejects.toThrowError("This agreement has already been executed.");
    expect((await stateOf(a.id)).events).toEqual({ SENT: 1, SIGNED: 2, FULLY_EXECUTED: 1 });
  });

  it("treats an executed agreement as terminal", async () => {
    const a = await makeAgreement(company, "executed");
    await expect(
      signAsCounterparty(a.counterpartySignerId, {
        signature: COUNTERPARTY_SIGNATURE,
        expectedSha256: a.frozenSha256,
      }),
    ).rejects.toThrowError(DocumentFlowError);
    await expect(
      sendDocument(a.id, { userId: company.paralegal.userId }),
    ).rejects.toThrowError("Only draft agreements can be sent.");
  });

  it("refuses any signature on a draft", async () => {
    const a = await makeAgreement(company, "draft");
    await expect(
      signAsCounterparty(a.counterpartySignerId, {
        signature: COUNTERPARTY_SIGNATURE,
        expectedSha256: "0".repeat(64),
      }),
    ).rejects.toThrowError("This agreement has not been sent for signature yet.");
  });

  it("refuses a signature bound to a different document hash", async () => {
    const a = await makeAgreement(company, "sent");
    await expect(
      signAsCounterparty(a.counterpartySignerId, {
        signature: COUNTERPARTY_SIGNATURE,
        expectedSha256: "f".repeat(64),
      }),
    ).rejects.toThrowError(/changed since you opened it/);
    expect((await stateOf(a.id)).status).toBe(DocumentStatus.SENT);
  });

  it("stamps every step with the injected clock", async () => {
    const t0 = new Date("2026-01-05T09:00:00.000Z");
    const t1 = new Date("2026-01-05T09:15:00.000Z");
    const t2 = new Date("2026-01-05T11:00:00.000Z");
    const t3 = new Date("2026-01-06T10:00:00.000Z");
    const document = await createDocument(
      {
        senderId: company.paralegal.senderId,
        countersignerId: company.signatory.userId,
        templateType: "NDA",
        title: "Clock test",
        counterpartyName: "Counterparty Co",
        counterpartyEmail: "cp@test.example",
      },
      { now: t0 },
    );
    const { frozenSha256 } = await sendDocument(
      document.id,
      { userId: company.paralegal.userId },
      { now: t1 },
    );
    const [counterparty] = await prisma.signer.findMany({
      where: { documentId: document.id, partyRole: "COUNTERPARTY" },
    });
    await signAsCounterparty(
      counterparty.id,
      { signature: COUNTERPARTY_SIGNATURE, expectedSha256: frozenSha256 },
      { now: t2 },
    );
    await countersign(
      document.id,
      asSignatory(),
      { signature: COMPANY_SIGNATURE, expectedSha256: frozenSha256 },
      { now: t3 },
    );

    const row = await prisma.document.findUniqueOrThrow({
      where: { id: document.id },
      include: { statusEvents: { orderBy: [{ timestamp: "asc" }, { eventType: "asc" }] } },
    });
    expect([row.createdAt, row.sentAt, row.counterpartySignedAt, row.countersignedAt]).toEqual([
      t0,
      t1,
      t2,
      t3,
    ]);
    expect(row.statusEvents.map((e) => [e.eventType, e.timestamp])).toEqual([
      ["CREATED", t0],
      ["SENT", t1],
      ["SIGNED", t2],
      ["SIGNED", t3],
      ["FULLY_EXECUTED", t3],
    ]);
  });
});
