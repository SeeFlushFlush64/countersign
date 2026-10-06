import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { DeliveryStatus, type MessageKind } from "@/generated/prisma/enums";
import { DocumentFlowError } from "@/lib/errors";
import { canManage } from "@/lib/permissions";
import { signingPath } from "@/lib/signing-links";
import { deliveryAdapter, type DeliveryAdapter } from "./adapters";
import { decryptLinkToken, encryptLinkToken } from "./link-crypto";

// The transactional outbox.
//
//   1. A lifecycle step writes its messages in its own transaction
//      (enqueueMessages), so a message exists exactly when the step committed.
//   2. After commit, each message is delivered (deliverMessage): claimed with
//      a conditional update and a lease, handed to the adapter, and its
//      outcome recorded. Delivery never touches the agreement, so a failure
//      can only ever leave a FAILED message behind — never a half-done step.
//   3. FAILED messages are retried: automatically by dispatchDueMessages (up
//      to MAX_AUTOMATIC_ATTEMPTS), and on demand by a company user
//      (retryDelivery). A SENDING message whose lease expired (a crashed
//      dispatcher) is due again.
//
// Delivery is at-least-once: a dispatcher that outlives its lease can race a
// second one. Each outcome is recorded only by the attempt that claimed it
// (WHERE attempts = <claimed attempt>), so the record stays consistent; a
// real email adapter should pass the message id as its idempotency key.

export type DeliveryDeps = { adapter?: DeliveryAdapter };
type DeliveryOptions = DeliveryDeps & { now?: Date };

export const DELIVERY_LEASE_MS = 60_000;
export const MAX_AUTOMATIC_ATTEMPTS = 3;

export type NewMessage = {
  documentId: string;
  kind: MessageKind;
  to: { name: string; email: string };
  subject: string;
  body: string;
  appPath?: string | null;
  // The counterparty's signing link: either a freshly issued token (sealed
  // here) or a sealed token copied from an earlier message for the same link.
  link?: { id: string; token: string } | { id: string; sealed: string } | null;
};

export async function enqueueMessages(
  tx: Prisma.TransactionClient,
  messages: NewMessage[],
  now: Date,
): Promise<string[]> {
  const ids: string[] = [];
  for (const message of messages) {
    const link = message.link ?? null;
    const row = await tx.outboundMessage.create({
      data: {
        documentId: message.documentId,
        kind: message.kind,
        recipientName: message.to.name,
        recipientEmail: message.to.email,
        subject: message.subject,
        body: message.body,
        appPath: message.appPath ?? null,
        signingLinkId: link?.id ?? null,
        linkCiphertext: link
          ? "token" in link
            ? encryptLinkToken(link.token, link.id)
            : link.sealed
          : null,
        createdAt: now,
      },
      select: { id: true },
    });
    ids.push(row.id);
  }
  return ids;
}

// Messages that have not gone out and must not any more (their link was
// superseded, or the agreement was voided). Runs inside the caller's
// transaction. A message being delivered at this moment is left alone;
// deliverMessage re-checks its link before handing it over.
export async function cancelUndelivered(
  tx: Prisma.TransactionClient,
  where: Prisma.OutboundMessageWhereInput,
  reason: string,
  now: Date,
) {
  await tx.outboundMessage.updateMany({
    where: { ...where, status: { in: [DeliveryStatus.PENDING, DeliveryStatus.FAILED] } },
    data: { status: DeliveryStatus.CANCELLED, cancelledAt: now, lastError: reason },
  });
}

function dueWhere(now: Date, manual: boolean): Prisma.OutboundMessageWhereInput[] {
  return [
    { status: DeliveryStatus.PENDING },
    { status: DeliveryStatus.SENDING, leaseExpiresAt: { lte: now } },
    manual
      ? { status: DeliveryStatus.FAILED }
      : { status: DeliveryStatus.FAILED, attempts: { lt: MAX_AUTOMATIC_ATTEMPTS } },
  ];
}

const LINK_NO_LONGER_VALID =
  "Not sent: the signing link was replaced, revoked or expired before delivery.";

export type DeliveryOutcome = { id: string; status: DeliveryStatus };

export async function deliverMessage(
  id: string,
  { adapter, now: fixedNow, manual = false }: DeliveryOptions & { manual?: boolean } = {},
): Promise<DeliveryOutcome> {
  const now = () => fixedNow ?? new Date();
  const claimedAt = now();
  const [message] = await prisma.outboundMessage.updateManyAndReturn({
    where: { id, OR: dueWhere(claimedAt, manual) },
    data: {
      status: DeliveryStatus.SENDING,
      attempts: { increment: 1 },
      lastAttemptAt: claimedAt,
      leaseExpiresAt: new Date(claimedAt.getTime() + DELIVERY_LEASE_MS),
    },
    select: {
      id: true,
      attempts: true,
      recipientName: true,
      recipientEmail: true,
      subject: true,
      body: true,
      appPath: true,
      signingLinkId: true,
      linkCiphertext: true,
    },
  });
  if (!message) {
    // Not due: delivered, cancelled, or being delivered by someone else.
    const current = await prisma.outboundMessage.findUnique({ where: { id }, select: { status: true } });
    if (!current) throw new DocumentFlowError("Message not found.", "NOT_FOUND");
    return { id, status: current.status };
  }

  // Only this attempt may record the outcome of this attempt.
  const finish = async (data: Prisma.OutboundMessageUpdateManyMutationInput) => {
    await prisma.outboundMessage.updateMany({
      where: { id, status: DeliveryStatus.SENDING, attempts: message.attempts },
      data: { ...data, leaseExpiresAt: null },
    });
    const after = await prisma.outboundMessage.findUniqueOrThrow({
      where: { id },
      select: { status: true },
    });
    return { id, status: after.status };
  };

  try {
    let path: string | null = null;
    if (message.signingLinkId && message.linkCiphertext) {
      const link = await prisma.signingLink.findUniqueOrThrow({
        where: { id: message.signingLinkId },
        select: { revokedAt: true, expiresAt: true },
      });
      if (link.revokedAt || link.expiresAt <= now()) {
        return await finish({
          status: DeliveryStatus.CANCELLED,
          cancelledAt: now(),
          lastError: LINK_NO_LONGER_VALID,
        });
      }
      const opened = decryptLinkToken(message.linkCiphertext, message.signingLinkId);
      if (!opened.ok) {
        throw new Error(
          opened.reason === "other_key"
            ? "The signing link was sealed with a different OUTBOX_ENCRYPTION_KEY and cannot be read."
            : "The stored signing link could not be decrypted.",
        );
      }
      path = signingPath(opened.token);
    }

    const channel = adapter ?? deliveryAdapter();
    await channel.deliver({
      id: message.id,
      to: { name: message.recipientName, email: message.recipientEmail },
      subject: message.subject,
      body: message.body,
      signingPath: path,
      appPath: message.appPath,
    });
    return await finish({
      status: DeliveryStatus.DELIVERED,
      channel: channel.channel,
      deliveredAt: now(),
      lastError: null,
    });
  } catch (error) {
    const reason = (error instanceof Error ? error.message : String(error)).slice(0, 500);
    console.error(`Delivery of message ${id} failed (attempt ${message.attempts}): ${reason}`);
    return finish({ status: DeliveryStatus.FAILED, lastError: reason || "Delivery failed." });
  }
}

// Delivers messages one at a time. A delivery failure never throws (it is
// recorded on the message); a database outage still does.
export async function deliverMessages(ids: string[], options: DeliveryOptions = {}) {
  const outcomes: DeliveryOutcome[] = [];
  for (const id of ids) outcomes.push(await deliverMessage(id, options));
  return outcomes;
}

// Delivers everything that is due: never-attempted messages, abandoned
// attempts, and failures below the automatic retry limit.
export async function dispatchDueMessages({
  documentId,
  limit = 25,
  ...options
}: DeliveryOptions & { documentId?: string; limit?: number } = {}) {
  const due = await prisma.outboundMessage.findMany({
    where: { ...(documentId ? { documentId } : {}), OR: dueWhere(options.now ?? new Date(), false) },
    orderBy: { createdAt: "asc" },
    take: limit,
    select: { id: true },
  });
  return deliverMessages(
    due.map((m) => m.id),
    options,
  );
}

// A company user retries one undelivered message (no attempt limit).
export async function retryDelivery(
  messageId: string,
  actor: { userId: string },
  options: DeliveryOptions = {},
): Promise<DeliveryOutcome> {
  const [message, user] = await Promise.all([
    prisma.outboundMessage.findUnique({
      where: { id: messageId },
      select: { status: true, document: { select: { senderId: true, countersignerId: true } } },
    }),
    prisma.user.findUnique({ where: { id: actor.userId }, select: { id: true, senderId: true } }),
  ]);
  if (!message) throw new DocumentFlowError("Message not found.", "NOT_FOUND");
  if (!canManage(user, message.document)) {
    throw new DocumentFlowError(
      "Only the sender or the designated countersigner can retry this delivery.",
      "FORBIDDEN",
    );
  }
  if (message.status !== DeliveryStatus.FAILED && message.status !== DeliveryStatus.PENDING) {
    throw new DocumentFlowError("This message is not waiting to be retried.");
  }
  return deliverMessage(messageId, { ...options, manual: true });
}

// What the outbox shows for a message's signing link: the link itself only
// to someone who may manage the agreement, and only while it still works.
export type LinkDisplay =
  | { state: "none" }
  | { state: "hidden" }
  | { state: "inactive" }
  | { state: "unreadable" }
  | { state: "active"; path: string };

export function linkDisplay(
  message: {
    signingLinkId: string | null;
    linkCiphertext: string | null;
    signingLink: { revokedAt: Date | null; expiresAt: Date } | null;
  },
  viewerCanManage: boolean,
  now = new Date(),
): LinkDisplay {
  if (!message.signingLinkId || !message.linkCiphertext || !message.signingLink) {
    return { state: "none" };
  }
  if (message.signingLink.revokedAt || message.signingLink.expiresAt <= now) {
    return { state: "inactive" };
  }
  if (!viewerCanManage) return { state: "hidden" };
  const opened = decryptLinkToken(message.linkCiphertext, message.signingLinkId);
  return opened.ok ? { state: "active", path: signingPath(opened.token) } : { state: "unreadable" };
}
