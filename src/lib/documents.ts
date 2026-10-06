import { prisma } from "@/lib/prisma";
import { renderDocumentHtml, renderFooterHtml } from "@/lib/pdf/template";
import { renderHtmlToPdf } from "@/lib/pdf/render";
import { COMPANY_NAME, COMPANY_ADDRESS } from "@/lib/pdf/content";
import { ROLE_LABELS } from "@/lib/labels";
import { formatLongDate, formatDateTime } from "@/lib/format";
import { DocumentStatus, PartyRole, StatusEventType } from "@/generated/prisma/enums";
import type { TemplateType } from "@/generated/prisma/enums";

export class DocumentFlowError extends Error {}

// Every lifecycle step takes an optional clock so a caller (the seed, tests)
// can drive the real transitions at fixed times. One `now` per step keeps the
// row timestamps and the event timestamps of that step identical.
export type Clock = { now?: Date };

async function generateAndStorePdf(documentId: string) {
  const document = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
    include: { signers: true, sender: true },
  });

  const company = document.signers.find((s) => s.partyRole === PartyRole.COMPANY);
  const counterparty = document.signers.find(
    (s) => s.partyRole === PartyRole.COUNTERPARTY,
  );

  const pdfData = {
    documentId: document.id,
    documentTitle: document.title,
    templateType: document.templateType,
    effectiveDate: formatLongDate(document.createdAt),
    companyName: COMPANY_NAME,
    companyAddress: COMPANY_ADDRESS,
    counterpartyName: document.counterpartyName,
    counterpartyEmail: document.counterpartyEmail,
    companySignerName: document.sender.name,
    companySignerRole: ROLE_LABELS[document.sender.role],
    companySignedAt: company?.signedAt ? formatDateTime(company.signedAt) : null,
    companySignatureData: company?.signatureData ?? null,
    counterpartySignedAt: counterparty?.signedAt
      ? formatDateTime(counterparty.signedAt)
      : null,
    counterpartySignatureData: counterparty?.signatureData ?? null,
  };

  const html = renderDocumentHtml(pdfData);
  const footerHtml = renderFooterHtml(pdfData);
  const pdf = await renderHtmlToPdf(html, footerHtml);

  await prisma.document.update({
    where: { id: documentId },
    data: {
      pdfData: new Uint8Array(pdf),
      pdfUrl: `/api/documents/${documentId}/pdf`,
    },
  });
}

export async function createDocument(input: {
  senderId: string;
  templateType: TemplateType;
  title: string;
  counterpartyName: string;
  counterpartyEmail: string;
}, { now = new Date() }: Clock = {}) {
  const sender = await prisma.sender.findUniqueOrThrow({
    where: { id: input.senderId },
  });

  const document = await prisma.document.create({
    data: {
      createdAt: now,
      title: input.title,
      templateType: input.templateType,
      senderId: input.senderId,
      counterpartyName: input.counterpartyName,
      counterpartyEmail: input.counterpartyEmail,
      status: DocumentStatus.DRAFT,
      signers: {
        create: [
          {
            partyRole: PartyRole.COMPANY,
            name: sender.name,
            email: sender.email,
          },
          {
            partyRole: PartyRole.COUNTERPARTY,
            name: input.counterpartyName,
            email: input.counterpartyEmail,
          },
        ],
      },
      statusEvents: {
        create: [
          {
            eventType: StatusEventType.CREATED,
            actor: sender.name,
            timestamp: now,
          },
        ],
      },
    },
  });

  await generateAndStorePdf(document.id);

  return document;
}

export async function sendDocument(
  documentId: string,
  { now = new Date() }: Clock = {},
) {
  const document = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
    include: { sender: true },
  });

  if (document.status !== DocumentStatus.DRAFT) {
    throw new DocumentFlowError("Only draft documents can be sent.");
  }

  await prisma.$transaction([
    prisma.document.update({
      where: { id: documentId },
      data: { status: DocumentStatus.SENT, sentAt: now },
    }),
    prisma.statusEvent.create({
      data: {
        documentId,
        eventType: StatusEventType.SENT,
        actor: document.sender.name,
        timestamp: now,
      },
    }),
  ]);
}

export async function recordView(
  signerId: string,
  { now = new Date() }: Clock = {},
) {
  const signer = await prisma.signer.findUniqueOrThrow({
    where: { id: signerId },
  });

  const alreadyViewed = await prisma.statusEvent.findFirst({
    where: {
      documentId: signer.documentId,
      eventType: StatusEventType.VIEWED,
      actor: signer.name,
    },
  });

  if (!alreadyViewed) {
    await prisma.statusEvent.create({
      data: {
        documentId: signer.documentId,
        eventType: StatusEventType.VIEWED,
        actor: signer.name,
        timestamp: now,
      },
    });
  }
}

export async function signAsSigner(
  signerId: string,
  signatureData: string,
  { now = new Date() }: Clock = {},
) {
  const signer = await prisma.signer.findUniqueOrThrow({
    where: { id: signerId },
    include: { document: { include: { signers: true } } },
  });

  const document = signer.document;

  if (
    document.status !== DocumentStatus.SENT &&
    document.status !== DocumentStatus.PARTIALLY_SIGNED
  ) {
    throw new DocumentFlowError(
      "This document is not currently available for signature.",
    );
  }

  if (signer.signedAt) {
    throw new DocumentFlowError("This signer has already signed.");
  }

  // Sequential signing: the counterparty signs first, and the company
  // countersigns second — matches the product's namesake.
  if (signer.partyRole === PartyRole.COMPANY) {
    const counterparty = document.signers.find(
      (s) => s.partyRole === PartyRole.COUNTERPARTY,
    );
    if (!counterparty?.signedAt) {
      throw new DocumentFlowError(
        "The counterparty must sign before the company can countersign.",
      );
    }
  }

  await prisma.signer.update({
    where: { id: signerId },
    data: { signedAt: now, signatureData },
  });

  await prisma.statusEvent.create({
    data: {
      documentId: document.id,
      eventType: StatusEventType.SIGNED,
      actor: signer.name,
      timestamp: now,
    },
  });

  const otherSigners = document.signers.filter((s) => s.id !== signerId);
  const allOthersSigned = otherSigners.every((s) => s.signedAt !== null);

  if (allOthersSigned) {
    await prisma.document.update({
      where: { id: document.id },
      data: { status: DocumentStatus.FULLY_EXECUTED, completedAt: now },
    });
    await prisma.statusEvent.create({
      data: {
        documentId: document.id,
        eventType: StatusEventType.FULLY_EXECUTED,
        actor: "Countersign",
        timestamp: now,
      },
    });
  } else if (document.status === DocumentStatus.SENT) {
    await prisma.document.update({
      where: { id: document.id },
      data: { status: DocumentStatus.PARTIALLY_SIGNED },
    });
  }

  await generateAndStorePdf(document.id);
}
