import { MessageKind } from "@/generated/prisma/enums";
import { COMPANY_NAME } from "@/lib/pdf/content";
import type { NewMessage } from "./outbox";

// The notifications each lifecycle step sends. Plain text only; the signing
// link travels separately (sealed) and is added by the delivery channel.

type Agreement = {
  id: string;
  title: string;
  counterpartyName: string;
  counterpartyEmail: string;
};
type Person = { name: string; email: string };

const utc = new Intl.DateTimeFormat("en-US", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: "UTC",
});
const at = (date: Date) => `${utc.format(date)} UTC`;
const counterparty = (a: Agreement): Person => ({ name: a.counterpartyName, email: a.counterpartyEmail });

export function signingRequest(
  agreement: Agreement,
  sender: Person,
  link: { id: string; token: string; expiresAt: Date },
  reissued: boolean,
): NewMessage {
  return {
    documentId: agreement.id,
    kind: reissued ? MessageKind.SIGNING_LINK_REISSUED : MessageKind.SIGNING_REQUEST,
    to: counterparty(agreement),
    subject: reissued
      ? `New signing link: ${agreement.title}`
      : `Signature requested: ${agreement.title}`,
    body: [
      reissued
        ? `${sender.name} at ${COMPANY_NAME} issued you a new link to review and sign "${agreement.title}". Any earlier link no longer works.`
        : `${sender.name} at ${COMPANY_NAME} asks you to review and sign "${agreement.title}".`,
      `Your personal signing link expires ${at(link.expiresAt)}. Anyone holding it can sign as ${agreement.counterpartyName}, so do not forward it.`,
    ].join("\n\n"),
    link: { id: link.id, token: link.token },
  };
}

export function countersignRequest(
  agreement: Agreement,
  countersigner: Person,
  signedAt: Date,
): NewMessage {
  return {
    documentId: agreement.id,
    kind: MessageKind.COUNTERSIGN_REQUEST,
    to: countersigner,
    subject: `Ready for your countersignature: ${agreement.title}`,
    body: `${agreement.counterpartyName} signed "${agreement.title}" at ${at(signedAt)}. It is waiting for your countersignature.`,
    appPath: `/documents/${agreement.id}/countersign`,
  };
}

export function executedNotices(
  agreement: Agreement,
  sender: Person,
  executedAt: Date,
  receiptUntil: Date,
  // The counterparty's (still readable) link, if its sealed copy is on file.
  counterpartyLink: { id: string; sealed: string } | null,
): NewMessage[] {
  const subject = `Executed: ${agreement.title}`;
  return [
    {
      documentId: agreement.id,
      kind: MessageKind.AGREEMENT_EXECUTED,
      to: counterparty(agreement),
      subject,
      body: [
        `Both parties have signed "${agreement.title}". It was executed at ${at(executedAt)}.`,
        counterpartyLink
          ? `Your signing link now gives read-only access to the executed PDF until ${at(receiptUntil)}.`
          : `Ask ${sender.name} at ${COMPANY_NAME} for a copy of the executed PDF.`,
      ].join("\n\n"),
      link: counterpartyLink,
    },
    {
      documentId: agreement.id,
      kind: MessageKind.AGREEMENT_EXECUTED,
      to: sender,
      subject,
      body: `"${agreement.title}" with ${agreement.counterpartyName} was executed at ${at(executedAt)}.`,
      appPath: `/documents/${agreement.id}`,
    },
  ];
}

export function voidedNotice(agreement: Agreement, voidedBy: Person, reason: string): NewMessage {
  return {
    documentId: agreement.id,
    kind: MessageKind.AGREEMENT_VOIDED,
    to: counterparty(agreement),
    subject: `Voided: ${agreement.title}`,
    body: [
      `${voidedBy.name} at ${COMPANY_NAME} voided "${agreement.title}". It can no longer be signed, and any signing link you received no longer works.`,
      `Reason: ${reason}`,
    ].join("\n\n"),
  };
}
