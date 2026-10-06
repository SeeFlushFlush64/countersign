import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { DocumentStatus } from "@/generated/prisma/enums";
import { prisma } from "@/lib/prisma";
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
vi.mock("next/headers", () => ({
  headers: async () =>
    new Headers({ "user-agent": "vitest-agent", "x-forwarded-for": "203.0.113.9" }),
}));

const { countersignAction } = await import("@/app/documents/[id]/countersign/actions");
const { sendDocumentAction, reissueLinkAction, voidDocumentAction } = await import(
  "@/app/documents/[id]/actions"
);
const { signLinkAction } = await import("@/app/s/[token]/actions");
const { retryDeliveryAction, dispatchDueAction } = await import("@/app/(shell)/outbox/actions");

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
    expect(result).toEqual({ error: "Sign in to send this agreement.", signingPath: null });
    expect((await stateOf(a.id)).status).toBe(DocumentStatus.DRAFT);
  });
});

describe("link management actions", () => {
  const reasonForm = (reason: string) => {
    const form = new FormData();
    form.set("reason", reason);
    return form;
  };

  it("send returns the signing link once, to a signed-in manager", async () => {
    const a = await makeAgreement(company, "draft");
    signedInAs(company.paralegal.userId);
    const result = await sendDocumentAction(a.id);
    expect(result.error).toBeNull();
    expect(result.signingPath).toMatch(/^\/s\/[A-Za-z0-9_-]{43}$/);
  });

  it("reissue refuses an unauthenticated caller", async () => {
    const a = await makeAgreement(company, "sent");
    const result = await reissueLinkAction(a.id, a.linkId);
    expect(result).toEqual({ error: "Sign in to reissue the signing link.", signingPath: null });
    expect(await prisma.signingLink.count({ where: { documentId: a.id } })).toBe(1);
  });

  it("void refuses an unauthenticated caller and a missing reason", async () => {
    const a = await makeAgreement(company, "sent");
    expect(await voidDocumentAction(a.id, { error: null, voided: false }, reasonForm("Valid reason"))).toEqual({
      error: "Sign in to void this agreement.",
      voided: false,
    });

    signedInAs(company.paralegal.userId);
    const blank = await voidDocumentAction(a.id, { error: null, voided: false }, reasonForm("   "));
    expect(blank.error).toMatch(/at least 3 characters/);
    expect((await prisma.document.findUniqueOrThrow({ where: { id: a.id } })).status).toBe("SENT");
  });

  it("void records the reason from the submitted form", async () => {
    const a = await makeAgreement(company, "sent");
    signedInAs(company.signatory.userId);
    const result = await voidDocumentAction(
      a.id,
      { error: null, voided: false },
      reasonForm("Replaced by a corrected agreement"),
    );
    expect(result).toEqual({ error: null, voided: true });
    const row = await prisma.document.findUniqueOrThrow({ where: { id: a.id } });
    expect(row.status).toBe("VOIDED");
    expect(row.voidReason).toBe("Replaced by a corrected agreement");
    expect(row.voidedById).toBe(company.signatory.userId);
  });
});

describe("reissueLinkAction double-click", () => {
  it("creates one new link; the repeated submit gets a clean conflict", async () => {
    const a = await makeAgreement(company, "sent");
    signedInAs(company.paralegal.userId);
    // Both submits carry the link id the page rendered with.
    const [first, second] = await Promise.all([
      reissueLinkAction(a.id, a.linkId),
      reissueLinkAction(a.id, a.linkId),
    ]);
    const results = [first, second];
    expect(results.filter((r) => r.signingPath)).toHaveLength(1);
    expect(results.filter((r) => r.error)).toEqual([
      { error: expect.stringMatching(/already reissued/), signingPath: null },
    ]);
    expect(await prisma.signingLink.count({ where: { documentId: a.id } })).toBe(2);
  });
});

describe("signLinkAction (public counterparty action)", () => {
  it("cannot be used with a signer id instead of a link token", async () => {
    const a = await makeAgreement(company, "counterpartySigned");
    const result = await signLinkAction(a.companySignerId, a.frozenSha256, COMPANY_SIGNATURE);
    expect(result?.error).toBe("This signing link is not valid.");
    expect((await stateOf(a.id)).status).toBe(DocumentStatus.PARTIALLY_SIGNED);
  });

  it("refuses while a company user is signed in (no accidental impersonation)", async () => {
    const a = await makeAgreement(company, "sent");
    signedInAs(company.paralegal.userId);
    const result = await signLinkAction(a.token, a.frozenSha256, COUNTERPARTY_SIGNATURE);
    expect(result?.error).toMatch(/signed in to Countersign as a company user/);
    expect((await stateOf(a.id)).status).toBe(DocumentStatus.SENT);
  });

  it("signs for the counterparty, recording the link and a hashed IP (never the raw IP)", async () => {
    const a = await makeAgreement(company, "sent");
    await signLinkAction(a.token, a.frozenSha256, COUNTERPARTY_SIGNATURE);
    expect((await stateOf(a.id)).status).toBe(DocumentStatus.PARTIALLY_SIGNED);

    const event = await prisma.statusEvent.findFirstOrThrow({
      where: { documentId: a.id, eventType: "SIGNED" },
    });
    expect(event.actorType).toBe("COUNTERPARTY_LINK");
    expect(event.signingLinkId).toBe(a.linkId);
    const metadata = event.metadata as { ipHash: string | null; userAgent: string | null };
    expect(metadata.userAgent).toBe("vitest-agent");
    expect(JSON.stringify(event.metadata)).not.toContain("203.0.113.9");
  });
});

describe("outbox actions", () => {
  async function failedMessage() {
    const a = await makeAgreement(company, "sent");
    const message = await prisma.outboundMessage.findFirstOrThrow({ where: { documentId: a.id } });
    // Put it back in a failed state, as an unreachable provider would leave it.
    await prisma.outboundMessage.update({
      where: { id: message.id },
      data: { status: "FAILED", deliveredAt: null, channel: null, lastError: "provider down" },
    });
    return message.id;
  }

  it("refuse an unauthenticated caller", async () => {
    const id = await failedMessage();
    expect(await retryDeliveryAction(id)).toEqual({
      error: "Sign in to retry this delivery.",
      result: null,
    });
    expect(await dispatchDueAction()).toEqual({
      error: "Sign in to deliver queued messages.",
      result: null,
    });
    expect((await prisma.outboundMessage.findUniqueOrThrow({ where: { id } })).status).toBe("FAILED");
  });

  it("let only the agreement's managers retry a delivery", async () => {
    const id = await failedMessage();
    signedInAs(company.otherSignatory.userId);
    expect((await retryDeliveryAction(id)).error).toMatch(/Only the sender or the designated countersigner/);
    expect((await prisma.outboundMessage.findUniqueOrThrow({ where: { id } })).status).toBe("FAILED");

    signedInAs(company.paralegal.userId);
    expect(await retryDeliveryAction(id)).toEqual({ error: null, result: "In demo outbox" });
    expect((await prisma.outboundMessage.findUniqueOrThrow({ where: { id } })).status).toBe("DELIVERED");
  });
});
