import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

// The Server Actions are the real entry points an attacker can POST to
// directly, bypassing pages and the proxy. These tests call them the same
// way, with the session mocked, to prove each action establishes the caller
// from the session itself and never trusts client input for identity.

const session = vi.hoisted(() => ({ current: null as null | { user: Record<string, string> } }));

vi.mock("@/auth", () => ({ auth: vi.fn(async () => session.current) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const { countersignAction } = await import("@/app/documents/[id]/countersign/actions");
const { sendDocumentAction } = await import("@/app/documents/[id]/actions");
const { signAction } = await import("@/app/sign/[signerId]/actions");

let company: Company;

beforeAll(async () => {
  await expectPrivateEmptyDatabase();
  company = await makeCompany();
});

beforeEach(() => {
  session.current = null;
});

const signedInAs = (userId: string) => {
  session.current = { user: { id: userId, senderId: "", senderName: "Test", senderRole: "" } };
};

describe("countersignAction", () => {
  it("refuses an unauthenticated caller", async () => {
    const a = await makeAgreement(company, "counterpartySigned");
    const result = await countersignAction(a.id, a.frozenSha256, COMPANY_SIGNATURE);
    expect(result).toEqual({ error: "Sign in to countersign." });
    expect((await stateOf(a.id)).status).toBe(DocumentStatus.PARTIALLY_SIGNED);
  });

  it("refuses a signed-in user who is not the designated signatory", async () => {
    const a = await makeAgreement(company, "counterpartySigned");
    signedInAs(company.paralegal.userId);
    const result = await countersignAction(a.id, a.frozenSha256, COMPANY_SIGNATURE);
    expect(result?.error).toMatch(/Only the designated countersigner/);
    expect((await stateOf(a.id)).status).toBe(DocumentStatus.PARTIALLY_SIGNED);
  });

  it("refuses the designated signatory before the counterparty signs", async () => {
    const a = await makeAgreement(company, "sent");
    signedInAs(company.signatory.userId);
    const result = await countersignAction(a.id, a.frozenSha256, COMPANY_SIGNATURE);
    expect(result?.error).toMatch(/counterparty must sign before/);
    expect((await stateOf(a.id)).status).toBe(DocumentStatus.SENT);
  });

  it("executes for the designated signatory after the counterparty", async () => {
    const a = await makeAgreement(company, "counterpartySigned");
    signedInAs(company.signatory.userId);
    await countersignAction(a.id, a.frozenSha256, COMPANY_SIGNATURE);
    expect((await stateOf(a.id)).status).toBe(DocumentStatus.FULLY_EXECUTED);
  });
});

describe("sendDocumentAction", () => {
  it("refuses an unauthenticated caller", async () => {
    const a = await makeAgreement(company, "draft");
    const result = await sendDocumentAction(a.id);
    expect(result).toEqual({ error: "Sign in to send this agreement." });
    expect((await stateOf(a.id)).status).toBe(DocumentStatus.DRAFT);
  });
});

describe("signAction (public counterparty action)", () => {
  it("cannot be used with the company signer's id", async () => {
    const a = await makeAgreement(company, "counterpartySigned");
    const result = await signAction(a.companySignerId, a.frozenSha256, COMPANY_SIGNATURE);
    expect(result?.error).toMatch(/countersigns from inside Countersign/);
    expect((await stateOf(a.id)).status).toBe(DocumentStatus.PARTIALLY_SIGNED);
  });

  it("signs for the counterparty", async () => {
    const a = await makeAgreement(company, "sent");
    await signAction(a.counterpartySignerId, a.frozenSha256, COUNTERPARTY_SIGNATURE);
    expect((await stateOf(a.id)).status).toBe(DocumentStatus.PARTIALLY_SIGNED);
  });
});
