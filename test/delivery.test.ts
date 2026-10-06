import http from "node:http";
import https from "node:https";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import {
  countersign,
  reissueSigningLink,
  sendDocument,
  signWithLink,
  voidDocument,
} from "@/lib/documents";
import {
  deliverMessage,
  dispatchDueMessages,
  linkDisplay,
  MAX_AUTOMATIC_ATTEMPTS,
  retryDelivery,
} from "@/lib/delivery/outbox";
import { type DeliveryAdapter, demoOutboxAdapter } from "@/lib/delivery/adapters";
import { decryptLinkToken } from "@/lib/delivery/link-crypto";
import { hashSigningToken } from "@/lib/signing-links";
import { DeliveryChannel, DeliveryStatus, DocumentStatus } from "@/generated/prisma/enums";
import { DocumentFlowError } from "@/lib/errors";
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

// Phase D: notifications go through a transactional outbox and a delivery
// adapter. In demo mode nothing leaves Countersign; delivery state is
// recorded, and a delivery failure never changes the agreement.

let company: Company;

beforeAll(async () => {
  await expectPrivateEmptyDatabase();
  company = await makeCompany();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const manager = () => ({ userId: company.paralegal.userId });

const messagesOf = (documentId: string) =>
  prisma.outboundMessage.findMany({ where: { documentId }, orderBy: [{ createdAt: "asc" }, { kind: "asc" }] });

function failingAdapter(message = "simulated provider outage") {
  const deliver = vi.fn(async () => {
    throw new Error(message);
  });
  return { adapter: { channel: DeliveryChannel.DEMO_OUTBOX, deliver } satisfies DeliveryAdapter, deliver };
}

function countingAdapter(delayMs = 0) {
  const deliver = vi.fn(async () => {
    if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
  });
  return { adapter: { channel: DeliveryChannel.DEMO_OUTBOX, deliver } satisfies DeliveryAdapter, deliver };
}

async function sentWithFailingDelivery() {
  const a = await makeAgreement(company, "draft");
  const sent = await sendDocument(a.id, manager(), {}, failingAdapter());
  const [message] = await messagesOf(a.id);
  return { ...a, ...sent, message };
}

describe("the outbox records every notification", () => {
  it("send writes one signature request, delivered to the demo outbox", async () => {
    const a = await makeAgreement(company, "sent");
    const messages = await messagesOf(a.id);
    expect(messages).toHaveLength(1);
    const [request] = messages;
    expect(request).toMatchObject({
      kind: "SIGNING_REQUEST",
      recipientName: "Counterparty Co",
      recipientEmail: "cp@test.example",
      subject: "Signature requested: Test agreement",
      signingLinkId: a.linkId,
      status: DeliveryStatus.DELIVERED,
      channel: DeliveryChannel.DEMO_OUTBOX,
      attempts: 1,
      lastError: null,
    });
    expect(request.deliveredAt).not.toBeNull();
    expect(request.lastAttemptAt).not.toBeNull();
    // The link is sealed: it opens to exactly the issued token, and the
    // stored link row still holds only that token's hash.
    const opened = decryptLinkToken(request.linkCiphertext!, a.linkId);
    expect(opened).toEqual({ ok: true, token: a.token });
    const link = await prisma.signingLink.findUniqueOrThrow({ where: { id: a.linkId } });
    expect(link.tokenHash).toBe(hashSigningToken(a.token));
  });

  it("writes each step's messages: reissue, counterparty signature, execution", async () => {
    const a = await makeAgreement(company, "sent");
    const reissued = await reissueSigningLink(a.id, manager(), { expectedLinkId: a.linkId });
    await signWithLink(reissued.signingToken, {
      signature: COUNTERPARTY_SIGNATURE,
      expectedSha256: a.frozenSha256,
    });
    await countersign(a.id, { userId: company.signatory.userId }, {
      signature: COMPANY_SIGNATURE,
      expectedSha256: a.frozenSha256,
    });

    const messages = await messagesOf(a.id);
    const signatoryEmail = (await prisma.user.findUniqueOrThrow({ where: { id: company.signatory.userId } })).email;
    const senderEmail = (await prisma.sender.findUniqueOrThrow({ where: { id: company.paralegal.senderId } })).email;
    expect(messages.slice(0, 3).map((m) => [m.kind, m.recipientEmail, m.status])).toEqual([
      ["SIGNING_REQUEST", "cp@test.example", "DELIVERED"],
      ["SIGNING_LINK_REISSUED", "cp@test.example", "DELIVERED"],
      ["COUNTERSIGN_REQUEST", signatoryEmail, "DELIVERED"],
    ]);
    // Both executed notices share the execution's timestamp.
    expect(
      messages
        .slice(3)
        .map((m) => [m.kind, m.recipientEmail, m.status])
        .sort(),
    ).toEqual(
      [
        ["AGREEMENT_EXECUTED", "cp@test.example", "DELIVERED"],
        ["AGREEMENT_EXECUTED", senderEmail, "DELIVERED"],
      ].sort(),
    );

    const countersignRequest = messages.find((m) => m.kind === "COUNTERSIGN_REQUEST")!;
    expect(countersignRequest.appPath).toBe(`/documents/${a.id}/countersign`);
    expect(countersignRequest.linkCiphertext).toBeNull();

    // The counterparty's executed notice carries their current link (now
    // read-only), copied sealed from the reissued request.
    const receipt = messages.find(
      (m) => m.kind === "AGREEMENT_EXECUTED" && m.recipientEmail === "cp@test.example",
    )!;
    expect(receipt.signingLinkId).toBe(reissued.signingLinkId);
    expect(decryptLinkToken(receipt.linkCiphertext!, reissued.signingLinkId)).toEqual({
      ok: true,
      token: reissued.signingToken,
    });
  });

  it("void notifies a counterparty who was sent the agreement, and no one for a draft", async () => {
    const sent = await makeAgreement(company, "sent");
    await voidDocument(sent.id, manager(), "Wrong counterparty entity");
    const notice = (await messagesOf(sent.id)).find((m) => m.kind === "AGREEMENT_VOIDED")!;
    expect(notice).toMatchObject({ recipientEmail: "cp@test.example", status: "DELIVERED" });
    expect(notice.body).toContain("Reason: Wrong counterparty entity");
    expect(notice.linkCiphertext).toBeNull();

    const draft = await makeAgreement(company, "draft");
    await voidDocument(draft.id, manager(), "Never needed");
    expect(await messagesOf(draft.id)).toEqual([]);
  });

  it("writes messages only when the step commits (one message for concurrent sends)", async () => {
    const a = await makeAgreement(company, "draft");
    const outcome = await race(
      Array.from({ length: 5 }, () => () => sendDocument(a.id, manager())),
    );
    expect(outcome.unexpected).toEqual([]);
    expect(outcome.succeeded).toBe(1);
    expect(await messagesOf(a.id)).toHaveLength(1);
  });

  it("writes no message when a step is refused", async () => {
    const a = await makeAgreement(company, "sent");
    await expect(
      countersign(a.id, { userId: company.signatory.userId }, {
        signature: COMPANY_SIGNATURE,
        expectedSha256: a.frozenSha256,
      }),
    ).rejects.toBeInstanceOf(DocumentFlowError);
    expect((await messagesOf(a.id)).map((m) => m.kind)).toEqual(["SIGNING_REQUEST"]);
  });
});

describe("demo mode sends nothing", () => {
  it("makes no outbound HTTP request through a whole agreement lifecycle", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const httpSpy = vi.spyOn(http, "request");
    const httpsSpy = vi.spyOn(https, "request");
    const a = await makeAgreement(company, "executed");
    expect(await messagesOf(a.id)).toHaveLength(4);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(httpSpy).not.toHaveBeenCalled();
    expect(httpsSpy).not.toHaveBeenCalled();
  });

  it("the demo adapter accepts a message without doing anything", async () => {
    await expect(
      demoOutboxAdapter.deliver({
        id: "m",
        to: { name: "A", email: "a@test.example" },
        subject: "s",
        body: "b",
        signingPath: null,
        appPath: null,
      }),
    ).resolves.toBeUndefined();
    expect(demoOutboxAdapter.channel).toBe(DeliveryChannel.DEMO_OUTBOX);
  });
});

describe("a delivery failure never touches the agreement", () => {
  it("keeps the send committed, records FAILED, and recovers on dispatch", async () => {
    const a = await sentWithFailingDelivery();
    expect((await stateOf(a.id)).status).toBe(DocumentStatus.SENT);
    expect(a.message).toMatchObject({
      status: DeliveryStatus.FAILED,
      attempts: 1,
      lastError: "simulated provider outage",
      deliveredAt: null,
      leaseExpiresAt: null,
    });
    // The link works regardless of delivery.
    const link = await prisma.signingLink.findUniqueOrThrow({ where: { id: a.signingLinkId } });
    expect(link.revokedAt).toBeNull();

    const outcomes = await dispatchDueMessages({ documentId: a.id });
    expect(outcomes).toEqual([{ id: a.message.id, status: DeliveryStatus.DELIVERED }]);
    const after = await prisma.outboundMessage.findUniqueOrThrow({ where: { id: a.message.id } });
    expect(after).toMatchObject({ status: "DELIVERED", attempts: 2, lastError: null });
    expect((await stateOf(a.id)).status).toBe(DocumentStatus.SENT);
  });

  it("keeps an execution final when its notifications fail", async () => {
    const a = await makeAgreement(company, "counterpartySigned");
    const { adapter } = failingAdapter();
    const artifact = await countersign(
      a.id,
      { userId: company.signatory.userId },
      { signature: COMPANY_SIGNATURE, expectedSha256: a.frozenSha256 },
      {},
      { adapter },
    );
    expect(artifact.status).toBe("READY");
    expect((await stateOf(a.id)).status).toBe(DocumentStatus.FULLY_EXECUTED);
    const executed = (await messagesOf(a.id)).filter((m) => m.kind === "AGREEMENT_EXECUTED");
    expect(executed.map((m) => m.status)).toEqual(["FAILED", "FAILED"]);
  });

  it("stops automatic retries at the limit; a manager can still retry", async () => {
    const a = await sentWithFailingDelivery();
    const { adapter } = failingAdapter("still down");
    for (let attempt = 2; attempt <= MAX_AUTOMATIC_ATTEMPTS; attempt++) {
      await dispatchDueMessages({ documentId: a.id, adapter });
    }
    let message = await prisma.outboundMessage.findUniqueOrThrow({ where: { id: a.message.id } });
    expect(message).toMatchObject({ status: "FAILED", attempts: MAX_AUTOMATIC_ATTEMPTS, lastError: "still down" });

    // Past the limit, dispatch leaves it alone…
    expect(await dispatchDueMessages({ documentId: a.id, adapter })).toEqual([]);
    // …only someone who manages the agreement may retry it by hand…
    await expect(retryDelivery(a.message.id, { userId: company.otherSignatory.userId })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    // …and that retry goes through.
    expect(await retryDelivery(a.message.id, manager())).toEqual({ id: a.message.id, status: "DELIVERED" });
    message = await prisma.outboundMessage.findUniqueOrThrow({ where: { id: a.message.id } });
    expect(message).toMatchObject({ status: "DELIVERED", attempts: MAX_AUTOMATIC_ATTEMPTS + 1 });

    // A delivered message is final.
    await expect(retryDelivery(a.message.id, manager())).rejects.toThrowError(/not waiting/);
  });
});

describe("dispatch is safe under concurrency and crashes", () => {
  it("delivers a message once when dispatchers race", async () => {
    const a = await sentWithFailingDelivery();
    const { adapter, deliver } = countingAdapter(50);
    const outcomes = await Promise.all(
      Array.from({ length: 5 }, () => deliverMessage(a.message.id, { adapter, manual: true })),
    );
    expect(deliver).toHaveBeenCalledTimes(1);
    // The winner reports DELIVERED; the others saw it in flight or done.
    expect(outcomes.filter((o) => o.status === DeliveryStatus.DELIVERED).length).toBeGreaterThanOrEqual(1);
    for (const outcome of outcomes) {
      expect([DeliveryStatus.DELIVERED, DeliveryStatus.SENDING]).toContain(outcome.status);
    }
    const message = await prisma.outboundMessage.findUniqueOrThrow({ where: { id: a.message.id } });
    expect(message).toMatchObject({ status: "DELIVERED", attempts: 2 });
  });

  it("reclaims an attempt whose dispatcher died, but not one still in progress", async () => {
    const a = await sentWithFailingDelivery();
    // A dispatcher claimed it and vanished; its lease is still running.
    await prisma.$executeRaw`
      UPDATE "OutboundMessage"
         SET "status" = 'SENDING', "attempts" = 2, "lastError" = NULL,
             "lastAttemptAt" = now() at time zone 'utc',
             "leaseExpiresAt" = (now() at time zone 'utc') + interval '1 minute'
       WHERE "id" = ${a.message.id}`;
    const { adapter, deliver } = countingAdapter();
    expect(await dispatchDueMessages({ documentId: a.id, adapter })).toEqual([]);
    expect(deliver).not.toHaveBeenCalled();

    // Once the lease has run out, it is due again.
    await prisma.$executeRaw`
      UPDATE "OutboundMessage" SET "leaseExpiresAt" = (now() at time zone 'utc') - interval '1 second'
       WHERE "id" = ${a.message.id}`;
    expect(await dispatchDueMessages({ documentId: a.id, adapter })).toEqual([
      { id: a.message.id, status: "DELIVERED" },
    ]);
    expect(deliver).toHaveBeenCalledTimes(1);
  });

  it("lets only the current attempt record an outcome", async () => {
    const a = await sentWithFailingDelivery();
    // Attempt 2 outlives its lease and attempt 3 takes over. While attempt 3
    // is still in flight, attempt 2 fails late: its failure must not be
    // recorded over attempt 3's claim.
    let releaseAttempt3!: () => void;
    const attempt3Holding = new Promise<void>((resolve) => (releaseAttempt3 = resolve));
    let attempt3Claimed!: () => void;
    const attempt3Started = new Promise<void>((resolve) => (attempt3Claimed = resolve));
    const held: DeliveryAdapter = {
      channel: DeliveryChannel.DEMO_OUTBOX,
      async deliver() {
        attempt3Claimed();
        await attempt3Holding;
      },
    };
    let attempt3!: Promise<unknown>;
    const stale: DeliveryAdapter = {
      channel: DeliveryChannel.DEMO_OUTBOX,
      async deliver() {
        await prisma.$executeRaw`
          UPDATE "OutboundMessage" SET "leaseExpiresAt" = (now() at time zone 'utc') - interval '1 second'
           WHERE "id" = ${a.message.id}`;
        attempt3 = deliverMessage(a.message.id, { adapter: held, manual: true });
        await attempt3Started;
        throw new Error("late failure from a stale attempt");
      },
    };

    await deliverMessage(a.message.id, { adapter: stale, manual: true });
    let message = await prisma.outboundMessage.findUniqueOrThrow({ where: { id: a.message.id } });
    expect(message).toMatchObject({ status: "SENDING", attempts: 3 });
    expect(message.leaseExpiresAt).not.toBeNull();

    releaseAttempt3();
    await attempt3;
    message = await prisma.outboundMessage.findUniqueOrThrow({ where: { id: a.message.id } });
    expect(message).toMatchObject({ status: "DELIVERED", attempts: 3, lastError: null });
  });
});

describe("a stale signing link is never delivered", () => {
  it("reissue cancels the old link's undelivered request", async () => {
    const a = await sentWithFailingDelivery();
    const reissued = await reissueSigningLink(a.id, manager(), { expectedLinkId: a.signingLinkId });
    const messages = await messagesOf(a.id);
    expect(messages.map((m) => [m.kind, m.status, m.signingLinkId])).toEqual([
      ["SIGNING_REQUEST", "CANCELLED", a.signingLinkId],
      ["SIGNING_LINK_REISSUED", "DELIVERED", reissued.signingLinkId],
    ]);
    expect(messages[0].lastError).toMatch(/replaced before delivery/);
    expect(messages[0].cancelledAt).not.toBeNull();
    // A cancelled message cannot be retried into delivery.
    await expect(retryDelivery(messages[0].id, manager())).rejects.toThrowError(/not waiting/);
  });

  it("void cancels everything still queued for the agreement", async () => {
    const a = await sentWithFailingDelivery();
    await voidDocument(a.id, manager(), "Superseded by a new agreement");
    const messages = await messagesOf(a.id);
    expect(messages.map((m) => [m.kind, m.status])).toEqual([
      ["SIGNING_REQUEST", "CANCELLED"],
      ["AGREEMENT_VOIDED", "DELIVERED"],
    ]);
  });

  it("cancels at delivery time if the link expired while queued", async () => {
    const a = await sentWithFailingDelivery();
    const later = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000);
    const { adapter, deliver } = countingAdapter();
    expect(await deliverMessage(a.message.id, { adapter, now: later })).toEqual({
      id: a.message.id,
      status: "CANCELLED",
    });
    expect(deliver).not.toHaveBeenCalled();
  });
});

describe("who sees a signing link in the outbox", () => {
  it("only the agreement's managers, and only while the link works", async () => {
    const a = await makeAgreement(company, "sent");
    const message = await prisma.outboundMessage.findFirstOrThrow({
      where: { documentId: a.id },
      include: { signingLink: { select: { revokedAt: true, expiresAt: true } } },
    });
    expect(linkDisplay(message, true)).toEqual({ state: "active", path: `/s/${a.token}` });
    expect(linkDisplay(message, false)).toEqual({ state: "hidden" });

    await reissueSigningLink(a.id, manager(), { expectedLinkId: a.linkId });
    const revoked = await prisma.outboundMessage.findFirstOrThrow({
      where: { id: message.id },
      include: { signingLink: { select: { revokedAt: true, expiresAt: true } } },
    });
    expect(linkDisplay(revoked, true)).toEqual({ state: "inactive" });
  });
});
