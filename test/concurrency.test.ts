import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  countersign,
  ORDER_VIOLATION_MESSAGE,
  sendDocument,
  signAsCounterparty,
} from "@/lib/documents";
import { ArtifactKind, DocumentStatus } from "@/generated/prisma/enums";
import { expectPrivateEmptyDatabase } from "./harness/private-database";
import {
  COMPANY_SIGNATURE,
  COUNTERPARTY_SIGNATURE,
  type Company,
  makeAgreement,
  makeCompany,
  race,
  stateOf,
} from "./helpers/agreements";

// Audit finding (High): concurrent submissions all "succeeded" — three
// countersigns produced three FULLY_EXECUTED events. Each transition is now a
// conditional update inside a transaction, so exactly one attempt wins and
// the rest fail cleanly with a DocumentFlowError (never a raw DB error).

const ATTEMPTS = 6;
let company: Company;

beforeAll(async () => {
  await expectPrivateEmptyDatabase();
  company = await makeCompany();
});

describe("exactly one winner", () => {
  it("for simultaneous counterparty signatures", async () => {
    const a = await makeAgreement(company, "sent");
    const outcome = await race(
      Array.from({ length: ATTEMPTS }, () => () =>
        signAsCounterparty(a.counterpartySignerId, {
          signature: COUNTERPARTY_SIGNATURE,
          expectedSha256: a.frozenSha256,
        }),
      ),
    );
    expect(outcome.unexpected).toEqual([]);
    expect(outcome.succeeded).toBe(1);

    const state = await stateOf(a.id);
    expect(state.status).toBe(DocumentStatus.PARTIALLY_SIGNED);
    expect(state.events.SIGNED).toBe(1);
  });

  it("for simultaneous countersignatures", async () => {
    const a = await makeAgreement(company, "counterpartySigned");
    const outcome = await race(
      Array.from({ length: ATTEMPTS }, () => () =>
        countersign(a.id, { userId: company.signatory.userId }, {
          signature: COMPANY_SIGNATURE,
          expectedSha256: a.frozenSha256,
        }),
      ),
    );
    expect(outcome.unexpected).toEqual([]);
    expect(outcome.succeeded).toBe(1);

    const state = await stateOf(a.id);
    expect(state.status).toBe(DocumentStatus.FULLY_EXECUTED);
    expect(state.events).toEqual({ SENT: 1, SIGNED: 2, FULLY_EXECUTED: 1 });
    expect(state.artifacts.filter((x) => x.kind === ArtifactKind.EXECUTED)).toEqual([
      { kind: ArtifactKind.EXECUTED, status: "READY" },
    ]);
  });

  it("for simultaneous sends (each renders and tries to freeze)", async () => {
    const a = await makeAgreement(company, "draft");
    const outcome = await race(
      Array.from({ length: 4 }, () => () =>
        sendDocument(a.id, { userId: company.paralegal.userId }),
      ),
    );
    expect(outcome.unexpected).toEqual([]);
    expect(outcome.succeeded).toBe(1);

    const state = await stateOf(a.id);
    expect(state.status).toBe(DocumentStatus.SENT);
    expect(state.events.SENT).toBe(1);
    expect(state.artifacts).toEqual([{ kind: ArtifactKind.FROZEN, status: "READY" }]);
    const row = await prisma.document.findUniqueOrThrow({ where: { id: a.id } });
    const frozen = await prisma.documentArtifact.findFirstOrThrow({ where: { documentId: a.id } });
    expect(row.frozenSha256).toBe(frozen.sha256);
  });
});

describe("ordering under a race", () => {
  it("never records a countersignature before the counterparty's signature", async () => {
    for (let round = 0; round < 5; round++) {
      const a = await makeAgreement(company, "sent");
      const [counterpartyResult, companyResult] = await Promise.allSettled([
        signAsCounterparty(a.counterpartySignerId, {
          signature: COUNTERPARTY_SIGNATURE,
          expectedSha256: a.frozenSha256,
        }),
        countersign(a.id, { userId: company.signatory.userId }, {
          signature: COMPANY_SIGNATURE,
          expectedSha256: a.frozenSha256,
        }),
      ]);
      expect(counterpartyResult.status).toBe("fulfilled");

      const state = await stateOf(a.id);
      if (companyResult.status === "rejected") {
        // The countersign looked before the counterparty's commit.
        expect((companyResult.reason as Error).message).toBe(ORDER_VIOLATION_MESSAGE);
        expect(state.status).toBe(DocumentStatus.PARTIALLY_SIGNED);
        expect(state.countersignedAt).toBeNull();
      } else {
        // It looked after the commit: a legitimate, correctly ordered execution.
        expect(state.status).toBe(DocumentStatus.FULLY_EXECUTED);
        expect(state.countersignedAt!.getTime()).toBeGreaterThanOrEqual(
          state.counterpartySignedAt!.getTime(),
        );
      }
    }
  });
});
