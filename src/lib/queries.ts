import { prisma } from "@/lib/prisma";
import { DocumentStatus, type TemplateType } from "@/generated/prisma/enums";
import type { QueueAgreement } from "@/lib/queue";
import { resolveSigningLink } from "@/lib/documents";

// Read models for the company pages. Each selects exactly what its page
// shows. None of them can load PDF bytes: the client omits them by default,
// and these selects never ask for them (test/pdf-query-shape.test.ts checks
// the SQL). PDFs are only read by the loaders in src/lib/documents.ts.

// The agreements queue (src/lib/queue.ts decides views and wording).
export async function listAgreements(): Promise<(QueueAgreement & { templateType: TemplateType })[]> {
  const rows = await prisma.document.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      templateType: true,
      status: true,
      createdAt: true,
      sentAt: true,
      counterpartySignedAt: true,
      countersignedAt: true,
      voidedAt: true,
      voidReason: true,
      counterpartyName: true,
      countersignerId: true,
      countersigner: { select: { sender: { select: { name: true } } } },
      sender: { select: { name: true } },
      activeLink: { select: { expiresAt: true, firstViewedAt: true } },
    },
  });
  return rows.map(({ countersigner, sender, ...row }) => ({
    ...row,
    countersignerName: countersigner?.sender.name ?? null,
    senderName: sender.name,
  }));
}

// How many agreements wait on this user's countersignature (navigation hint).
export function countNeedingCountersign(userId: string) {
  return prisma.document.count({
    where: { status: DocumentStatus.PARTIALLY_SIGNED, countersignerId: userId },
  });
}

const messageSelect = {
  id: true,
  documentId: true,
  kind: true,
  recipientName: true,
  recipientEmail: true,
  subject: true,
  body: true,
  appPath: true,
  signingLinkId: true,
  linkCiphertext: true,
  status: true,
  channel: true,
  attempts: true,
  lastError: true,
  createdAt: true,
  lastAttemptAt: true,
  deliveredAt: true,
  cancelledAt: true,
  signingLink: { select: { revokedAt: true, expiresAt: true } },
} as const;

export function getAgreementDetail(id: string) {
  return prisma.document.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      templateType: true,
      status: true,
      createdAt: true,
      sentAt: true,
      counterpartySignedAt: true,
      countersignedAt: true,
      frozenSha256: true,
      senderId: true,
      countersignerId: true,
      counterpartyName: true,
      counterpartyEmail: true,
      voidedAt: true,
      voidReason: true,
      sender: { select: { name: true, email: true, role: true } },
      signers: {
        select: { id: true, partyRole: true, name: true, signedAt: true },
      },
      countersigner: {
        select: { email: true, isSignatory: true, sender: { select: { name: true, role: true } } },
      },
      voidedBy: { select: { sender: { select: { name: true } } } },
      activeLink: {
        select: { id: true, createdAt: true, expiresAt: true, firstViewedAt: true, usedAt: true },
      },
      artifacts: {
        select: { kind: true, status: true, sha256: true, attempts: true, lastError: true },
      },
      statusEvents: { orderBy: { timestamp: "asc" } },
      messages: { orderBy: { createdAt: "asc" }, select: messageSelect },
    },
  });
}

export type AgreementDetail = NonNullable<Awaited<ReturnType<typeof getAgreementDetail>>>;

// The countersign page: the frozen document's identity and the
// counterparty's signature (shown to the countersigner before they sign).
export function getCountersignView(id: string) {
  return prisma.document.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      templateType: true,
      status: true,
      frozenSha256: true,
      counterpartyName: true,
      counterpartyEmail: true,
      counterpartySignedAt: true,
      countersignedAt: true,
      countersignerId: true,
      countersigner: { select: { isSignatory: true, sender: { select: { name: true, role: true } } } },
      signers: { where: { partyRole: "COUNTERPARTY" }, select: { signatureData: true } },
    },
  });
}

// The counterparty's signing room. The link itself is validated by
// resolveSigningLink (src/lib/documents.ts); only for a valid link are the
// agreement's display facts loaded — the same people, dates and fingerprints
// the PDF itself shows, never anything about other agreements.
export async function getSigningRoom(token: string, now: Date = new Date()) {
  const link = await resolveSigningLink(token, now);
  if (link.state !== "valid") return { link, details: null };
  const details = await prisma.document.findUniqueOrThrow({
    where: { id: link.document.id },
    select: {
      sentAt: true,
      counterpartyName: true,
      counterpartyEmail: true,
      counterpartySignedAt: true,
      countersignedAt: true,
      countersigner: { select: { sender: { select: { name: true, role: true } } } },
      artifacts: {
        where: { kind: { in: ["FROZEN", "EXECUTED"] } },
        select: { kind: true, status: true, sha256: true },
      },
    },
  });
  return { link, details };
}

export function listOutbox(take = 100) {
  return prisma.outboundMessage.findMany({
    orderBy: { createdAt: "desc" },
    take,
    select: {
      ...messageSelect,
      document: { select: { title: true, senderId: true, countersignerId: true } },
    },
  });
}

export type OutboxMessage = Awaited<ReturnType<typeof listOutbox>>[number];

// The audit log: the append-only StatusEvent history, newest first,
// optionally for one agreement.
export function listAuditEvents({ agreementId, take = 200 }: { agreementId?: string; take?: number } = {}) {
  return prisma.statusEvent.findMany({
    where: agreementId ? { documentId: agreementId } : undefined,
    orderBy: [{ timestamp: "desc" }, { id: "desc" }],
    take,
    select: {
      id: true,
      eventType: true,
      actor: true,
      actorType: true,
      timestamp: true,
      metadata: true,
      document: { select: { id: true, title: true } },
    },
  });
}

export type AuditEvent = Awaited<ReturnType<typeof listAuditEvents>>[number];
