import { prisma } from "@/lib/prisma";

// Read models for the company pages. Each selects exactly what its page
// shows. None of them can load PDF bytes: the client omits them by default,
// and these selects never ask for them (test/pdf-query-shape.test.ts checks
// the SQL). PDFs are only read by the loaders in src/lib/documents.ts.

export function listAgreements() {
  return prisma.document.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      title: true,
      templateType: true,
      status: true,
      createdAt: true,
      sender: { select: { name: true } },
      signers: { select: { signedAt: true } },
    },
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
      countersigner: { select: { sender: { select: { name: true } } } },
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
