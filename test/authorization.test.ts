import { beforeAll, describe, expect, it } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  countersign,
  createDocument,
  DocumentFlowError,
  sendDocument,
  signWithLink,
} from "@/lib/documents";
import { DocumentStatus } from "@/generated/prisma/enums";
import { expectPrivateEmptyDatabase } from "./harness/private-database";
import {
  COMPANY_SIGNATURE,
  type Company,
  makeAgreement,
  makeCompany,
  stateOf,
} from "./helpers/agreements";

// Audit finding C1 (Critical): anyone holding the company's signing link
// could countersign anonymously. The countersignature now requires the
// authenticated, designated, still-authorized company signatory.

let company: Company;

beforeAll(async () => {
  await expectPrivateEmptyDatabase();
  company = await makeCompany();
});

async function expectFlowError(promise: Promise<unknown>, code: string, message?: RegExp) {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(DocumentFlowError);
  expect((error as DocumentFlowError).code).toBe(code);
  if (message) expect((error as Error).message).toMatch(message);
}

describe("company countersignature authorization", () => {
  it("cannot be made through a signing link (the old anonymous path)", async () => {
    const a = await makeAgreement(company, "counterpartySigned");
    // Links are only ever issued to the counterparty…
    const links = await prisma.signingLink.findMany({
      where: { documentId: a.id },
      select: { signer: { select: { partyRole: true } } },
    });
    expect(links.map((l) => l.signer.partyRole)).toEqual(["COUNTERPARTY"]);
    // …and the company signer's id (the old bearer credential) is not a link.
    await expectFlowError(
      signWithLink(a.companySignerId, {
        signature: COMPANY_SIGNATURE,
        expectedSha256: a.frozenSha256,
      }),
      "LINK_INVALID",
    );
    // The counterparty's own (already used) link cannot add a second signature.
    await expectFlowError(
      signWithLink(a.token, { signature: COMPANY_SIGNATURE, expectedSha256: a.frozenSha256 }),
      "CONFLICT",
    );
    expect((await stateOf(a.id)).status).toBe(DocumentStatus.PARTIALLY_SIGNED);
  });

  it.each([
    ["a non-signatory company user", (c: Company) => c.paralegal.userId],
    ["a signatory who is not the designated countersigner", (c: Company) => c.otherSignatory.userId],
    ["an unknown user id", () => "no-such-user"],
  ])("is refused for %s", async (_label, who) => {
    const a = await makeAgreement(company, "counterpartySigned");
    await expectFlowError(
      countersign(a.id, { userId: who(company) }, {
        signature: COMPANY_SIGNATURE,
        expectedSha256: a.frozenSha256,
      }),
      "FORBIDDEN",
    );
    const state = await stateOf(a.id);
    expect(state.status).toBe(DocumentStatus.PARTIALLY_SIGNED);
    expect(state.countersignedAt).toBeNull();
  });

  it("is refused once the designated user loses signatory rights", async () => {
    const a = await makeAgreement(company, "counterpartySigned");
    await prisma.user.update({
      where: { id: company.signatory.userId },
      data: { isSignatory: false },
    });
    try {
      await expectFlowError(
        countersign(a.id, { userId: company.signatory.userId }, {
          signature: COMPANY_SIGNATURE,
          expectedSha256: a.frozenSha256,
        }),
        "FORBIDDEN",
        /not authorized to countersign/,
      );
    } finally {
      await prisma.user.update({
        where: { id: company.signatory.userId },
        data: { isSignatory: true },
      });
    }
    expect((await stateOf(a.id)).status).toBe(DocumentStatus.PARTIALLY_SIGNED);
  });

  it("succeeds for the designated signatory", async () => {
    const a = await makeAgreement(company, "counterpartySigned");
    await countersign(a.id, { userId: company.signatory.userId }, {
      signature: COMPANY_SIGNATURE,
      expectedSha256: a.frozenSha256,
    });
    expect((await stateOf(a.id)).status).toBe(DocumentStatus.FULLY_EXECUTED);
  });
});

describe("designating and sending", () => {
  it("only a signatory can be designated as countersigner", async () => {
    await expectFlowError(
      createDocument({
        senderId: company.paralegal.senderId,
        countersignerId: company.paralegal.userId,
        templateType: "NDA",
        title: "Bad countersigner",
        counterpartyName: "Counterparty Co",
        counterpartyEmail: "cp@test.example",
      }),
      "INVALID",
    );
    expect(await prisma.document.count({ where: { title: "Bad countersigner" } })).toBe(0);
  });

  it("only the sender or the designated countersigner can send", async () => {
    const a = await makeAgreement(company, "draft");
    await expectFlowError(
      sendDocument(a.id, { userId: company.otherSignatory.userId }),
      "FORBIDDEN",
    );
    expect((await stateOf(a.id)).status).toBe(DocumentStatus.DRAFT);

    await sendDocument(a.id, { userId: company.signatory.userId });
    expect((await stateOf(a.id)).status).toBe(DocumentStatus.SENT);
  });
});
