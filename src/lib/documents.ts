import { prisma } from "@/lib/prisma";
import { renderDocumentHtml, renderFooterHtml } from "@/lib/pdf/template";
import { renderHtmlToPdf } from "@/lib/pdf/render";
import { buildExecutedPdf } from "@/lib/pdf/execution-page";
import { COMPANY_NAME, COMPANY_ADDRESS } from "@/lib/pdf/content";
import { ROLE_LABELS } from "@/lib/labels";
import { formatLongDate } from "@/lib/format";
import { sha256Hex } from "@/lib/hash";
import { InvalidSignatureError, toDataUrl, validateSignature } from "@/lib/signature";
import {
  ArtifactKind,
  ArtifactStatus,
  DocumentStatus,
  PartyRole,
  StatusEventType,
} from "@/generated/prisma/enums";
import type { TemplateType } from "@/generated/prisma/enums";

// The agreement lifecycle. Every transition follows the same shape:
//
//   1. validate input and authorize the actor (outside any transaction);
//   2. do slow work that must not hold locks (Chromium rendering) up front;
//   3. in one transaction, move the agreement with a *conditional* update
//      (WHERE id = ? AND status = <expected> …) and require exactly one row
//      to change, then write the signer row, artifact and audit event.
//
// Two concurrent requests for the same transition therefore cannot both
// succeed: Postgres serializes the row update, the loser re-checks the WHERE
// clause against the committed row, matches nothing, and its transaction
// rolls back. CHECK constraints in the database back up the ordering rule
// independently of this code.

export type FlowErrorCode = "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "INVALID";

export class DocumentFlowError extends Error {
  constructor(
    message: string,
    readonly code: FlowErrorCode = "CONFLICT",
  ) {
    super(message);
    this.name = "DocumentFlowError";
  }
}

// Every lifecycle step takes an optional clock so a caller (the seed, tests)
// can drive the real transitions at fixed times. One `now` per step keeps the
// row timestamps and the event timestamps of that step identical.
//
// Without an injected clock, a transition reads the time only after it has
// read the agreement's current state, immediately before its transaction.
// That ordering is what makes the countersignature's timestamp provably later
// than the counterparty's: the counterparty's time is taken before its commit,
// and the countersign can only observe that commit before taking its own.
export type Clock = { now?: Date };

// Postgres rejected the write on a constraint (e.g. the ordering CHECK or a
// unique index). With the conditional updates above this should not happen;
// if it does (clock skew between servers, a bug), it surfaces as a clean
// conflict instead of an unhandled database error.
function isConstraintViolation(error: unknown): boolean {
  const text = error instanceof Error ? `${error.message} ${String(error.cause ?? "")}` : "";
  return /23514|23505|check constraint|unique constraint|P2002|P2004/i.test(text);
}

async function inTransition<T>(conflictMessage: string, run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (error) {
    if (error instanceof DocumentFlowError) throw error;
    if (isConstraintViolation(error)) throw new DocumentFlowError(conflictMessage);
    throw error;
  }
}

// An authenticated company user, as established by the session — never by
// anything the client sends.
export type Actor = { userId: string };

export const ORDER_VIOLATION_MESSAGE =
  "The counterparty must sign before the company can countersign.";

type SignatureSubmission = {
  signature: unknown;
  // The SHA-256 of the frozen agreement the signer was shown.
  expectedSha256: string;
};

async function validSignatureOrFail(signature: unknown) {
  try {
    return await validateSignature(signature);
  } catch (error) {
    if (error instanceof InvalidSignatureError) {
      throw new DocumentFlowError(error.message, "INVALID");
    }
    throw error;
  }
}

function requireOneRow(count: number, message: string) {
  if (count !== 1) throw new DocumentFlowError(message, "CONFLICT");
}

// ---------------------------------------------------------------------------
// Rendering

async function renderAgreementPdf(documentId: string): Promise<Buffer> {
  const document = await prisma.document.findUniqueOrThrow({
    where: { id: documentId },
    include: { sender: true, countersigner: { include: { sender: true } } },
  });
  // Agreements created before countersigners existed fall back to the sender.
  const signatory = document.countersigner?.sender ?? document.sender;

  const data = {
    documentId: document.id,
    documentTitle: document.title,
    templateType: document.templateType,
    effectiveDate: formatLongDate(document.createdAt),
    companyName: COMPANY_NAME,
    companyAddress: COMPANY_ADDRESS,
    counterpartyName: document.counterpartyName,
    counterpartyEmail: document.counterpartyEmail,
    countersignerName: signatory.name,
    countersignerRole: ROLE_LABELS[signatory.role],
  };
  return renderHtmlToPdf(renderDocumentHtml(data), renderFooterHtml(data));
}

// ---------------------------------------------------------------------------
// Create (DRAFT)

export async function createDocument(
  input: {
    senderId: string;
    countersignerId: string;
    templateType: TemplateType;
    title: string;
    counterpartyName: string;
    counterpartyEmail: string;
  },
  { now = new Date() }: Clock = {},
) {
  const [sender, countersigner] = await Promise.all([
    prisma.sender.findUniqueOrThrow({ where: { id: input.senderId } }),
    prisma.user.findUnique({
      where: { id: input.countersignerId },
      include: { sender: true },
    }),
  ]);
  if (!countersigner?.isSignatory) {
    throw new DocumentFlowError("Choose a company signatory to countersign.", "INVALID");
  }

  const document = await prisma.document.create({
    data: {
      createdAt: now,
      title: input.title,
      templateType: input.templateType,
      senderId: input.senderId,
      countersignerId: countersigner.id,
      counterpartyName: input.counterpartyName,
      counterpartyEmail: input.counterpartyEmail,
      status: DocumentStatus.DRAFT,
      signers: {
        create: [
          {
            partyRole: PartyRole.COMPANY,
            name: countersigner.sender.name,
            email: countersigner.email,
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

  // Draft preview only; the binding copy is rendered and frozen at send.
  const preview = await renderAgreementPdf(document.id);
  await prisma.document.update({
    where: { id: document.id },
    data: {
      pdfData: new Uint8Array(preview),
      pdfUrl: `/api/documents/${document.id}/pdf`,
    },
  });

  return document;
}

// ---------------------------------------------------------------------------
// Send: DRAFT → SENT, freezing the agreement and its SHA-256

export async function sendDocument(
  documentId: string,
  actor: Actor,
  clock: Clock = {},
) {
  const [document, user] = await Promise.all([
    prisma.document.findUnique({ where: { id: documentId } }),
    prisma.user.findUnique({ where: { id: actor.userId }, include: { sender: true } }),
  ]);
  if (!document) throw new DocumentFlowError("Agreement not found.", "NOT_FOUND");
  if (!user || (user.senderId !== document.senderId && user.id !== document.countersignerId)) {
    throw new DocumentFlowError(
      "Only the sender or the designated countersigner can send this agreement.",
      "FORBIDDEN",
    );
  }
  if (document.status !== DocumentStatus.DRAFT) {
    throw new DocumentFlowError("Only draft agreements can be sent.");
  }
  if (!document.countersignerId) {
    throw new DocumentFlowError("Choose a countersigner before sending.", "INVALID");
  }

  // Rendered before the transaction: Chromium can take seconds and must not
  // hold row locks. If it fails, nothing has changed.
  const frozen = await renderAgreementPdf(documentId);
  const frozenSha256 = sha256Hex(frozen);
  const now = clock.now ?? new Date();

  await inTransition("This agreement has already been sent.", () => prisma.$transaction(async (tx) => {
    const moved = await tx.document.updateMany({
      where: { id: documentId, status: DocumentStatus.DRAFT },
      data: { status: DocumentStatus.SENT, sentAt: now, frozenSha256 },
    });
    requireOneRow(moved.count, "This agreement has already been sent.");

    await tx.documentArtifact.create({
      data: {
        documentId,
        kind: ArtifactKind.FROZEN,
        status: ArtifactStatus.READY,
        pdfData: new Uint8Array(frozen),
        sha256: frozenSha256,
      },
    });
    await tx.statusEvent.create({
      data: {
        documentId,
        eventType: StatusEventType.SENT,
        actor: user.sender.name,
        timestamp: now,
      },
    });
  }));

  return { frozenSha256 };
}

// ---------------------------------------------------------------------------
// Views (unchanged in Phase B; view integrity is Phase C)

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

// ---------------------------------------------------------------------------
// Counterparty signs: SENT → PARTIALLY_SIGNED

export async function signAsCounterparty(
  signerId: string,
  { signature, expectedSha256 }: SignatureSubmission,
  clock: Clock = {},
) {
  const valid = await validSignatureOrFail(signature);

  const signer = await prisma.signer.findUnique({
    where: { id: signerId },
    include: { document: true },
  });
  if (!signer) throw new DocumentFlowError("This signing link is not valid.", "NOT_FOUND");
  if (signer.partyRole !== PartyRole.COUNTERPARTY) {
    throw new DocumentFlowError(
      "The company countersigns from inside Countersign, not from a signing link.",
      "FORBIDDEN",
    );
  }

  const document = signer.document;
  if (document.status === DocumentStatus.DRAFT) {
    throw new DocumentFlowError("This agreement has not been sent for signature yet.");
  }
  if (document.status !== DocumentStatus.SENT) {
    throw new DocumentFlowError("This agreement is no longer awaiting your signature.");
  }
  if (!document.frozenSha256 || document.frozenSha256 !== expectedSha256) {
    throw new DocumentFlowError(
      "This agreement changed since you opened it. Reload it and review it again.",
    );
  }

  const now = clock.now ?? new Date();
  await inTransition("This agreement is no longer awaiting your signature.", () => prisma.$transaction(async (tx) => {
    const moved = await tx.document.updateMany({
      where: { id: document.id, status: DocumentStatus.SENT, frozenSha256: expectedSha256 },
      data: { status: DocumentStatus.PARTIALLY_SIGNED, counterpartySignedAt: now },
    });
    requireOneRow(moved.count, "This agreement is no longer awaiting your signature.");

    const signed = await tx.signer.updateMany({
      where: { id: signer.id, signedAt: null },
      data: { signedAt: now, signatureData: toDataUrl(valid.png) },
    });
    requireOneRow(signed.count, "This signature has already been recorded.");

    await tx.statusEvent.create({
      data: {
        documentId: document.id,
        eventType: StatusEventType.SIGNED,
        actor: signer.name,
        timestamp: now,
      },
    });
  }));
}

// ---------------------------------------------------------------------------
// Company countersigns: PARTIALLY_SIGNED → FULLY_EXECUTED

type ArtifactDeps = { stamp?: typeof buildExecutedPdf };

export async function countersign(
  documentId: string,
  actor: Actor,
  { signature, expectedSha256 }: SignatureSubmission,
  clock: Clock = {},
  deps: ArtifactDeps = {},
) {
  const valid = await validSignatureOrFail(signature);

  const [document, user] = await Promise.all([
    prisma.document.findUnique({ where: { id: documentId } }),
    prisma.user.findUnique({ where: { id: actor.userId }, include: { sender: true } }),
  ]);
  if (!document) throw new DocumentFlowError("Agreement not found.", "NOT_FOUND");
  if (!user || user.id !== document.countersignerId) {
    throw new DocumentFlowError(
      "Only the designated countersigner can countersign this agreement.",
      "FORBIDDEN",
    );
  }
  if (!user.isSignatory) {
    throw new DocumentFlowError("Your account is not authorized to countersign.", "FORBIDDEN");
  }
  if (document.status === DocumentStatus.DRAFT || document.status === DocumentStatus.SENT) {
    throw new DocumentFlowError(ORDER_VIOLATION_MESSAGE);
  }
  if (document.status !== DocumentStatus.PARTIALLY_SIGNED) {
    throw new DocumentFlowError("This agreement has already been executed.");
  }
  if (!document.frozenSha256 || document.frozenSha256 !== expectedSha256) {
    throw new DocumentFlowError(
      "This agreement changed since you opened it. Reload it and review it again.",
    );
  }

  const now = clock.now ?? new Date();
  await inTransition("This agreement has already been executed.", () => prisma.$transaction(async (tx) => {
    const moved = await tx.document.updateMany({
      where: {
        id: documentId,
        status: DocumentStatus.PARTIALLY_SIGNED,
        countersignerId: user.id,
        frozenSha256: expectedSha256,
      },
      data: { status: DocumentStatus.FULLY_EXECUTED, countersignedAt: now, completedAt: now },
    });
    requireOneRow(moved.count, "This agreement has already been executed.");

    const signed = await tx.signer.updateMany({
      where: { documentId, partyRole: PartyRole.COMPANY, signedAt: null },
      data: { signedAt: now, signatureData: toDataUrl(valid.png) },
    });
    requireOneRow(signed.count, "The countersignature has already been recorded.");

    await tx.statusEvent.createMany({
      data: [
        { documentId, eventType: StatusEventType.SIGNED, actor: user.sender.name, timestamp: now },
        { documentId, eventType: StatusEventType.FULLY_EXECUTED, actor: "Countersign", timestamp: now },
      ],
    });
    await tx.documentArtifact.create({
      data: { documentId, kind: ArtifactKind.EXECUTED, status: ArtifactStatus.PENDING },
    });
  }));

  // After commit: execution is already final. Producing the executed PDF is
  // derived work — if it fails it is recorded as FAILED and retried later,
  // and never undoes or blocks the execution itself.
  return generateExecutedArtifact(documentId, deps);
}

// ---------------------------------------------------------------------------
// Executed artifact: PENDING/FAILED → READY (idempotent, retryable)

export async function generateExecutedArtifact(
  documentId: string,
  { stamp = buildExecutedPdf }: ArtifactDeps = {},
) {
  const artifact = await prisma.documentArtifact.findUnique({
    where: { documentId_kind: { documentId, kind: ArtifactKind.EXECUTED } },
    select: { id: true, status: true, sha256: true },
  });
  if (!artifact) {
    throw new DocumentFlowError("This agreement has not been executed.", "NOT_FOUND");
  }
  if (artifact.status === ArtifactStatus.READY) return artifact;

  try {
    const document = await prisma.document.findUniqueOrThrow({
      where: { id: documentId },
      include: {
        signers: true,
        countersigner: { include: { sender: true } },
        artifacts: { where: { kind: ArtifactKind.FROZEN, status: ArtifactStatus.READY } },
      },
    });
    const frozen = document.artifacts[0];
    const counterparty = document.signers.find((s) => s.partyRole === PartyRole.COUNTERPARTY);
    const company = document.signers.find((s) => s.partyRole === PartyRole.COMPANY);
    if (
      !frozen?.pdfData ||
      !document.frozenSha256 ||
      !counterparty?.signatureData ||
      !company?.signatureData ||
      !document.counterpartySignedAt ||
      !document.countersignedAt ||
      !document.countersigner
    ) {
      throw new Error("The executed agreement is missing data needed to produce its PDF.");
    }

    const signatory = document.countersigner.sender;
    const pdf = await stamp({
      documentId,
      title: document.title,
      frozenPdf: new Uint8Array(frozen.pdfData),
      frozenSha256: document.frozenSha256,
      counterparty: {
        name: counterparty.name,
        detail: counterparty.email,
        signedAt: document.counterpartySignedAt,
        signaturePng: (await validateSignature(counterparty.signatureData)).png,
      },
      company: {
        name: signatory.name,
        detail: `${ROLE_LABELS[signatory.role]}, ${COMPANY_NAME}`,
        signedAt: document.countersignedAt,
        signaturePng: (await validateSignature(company.signatureData)).png,
      },
      executedAt: document.countersignedAt,
    });

    await prisma.documentArtifact.updateMany({
      where: { id: artifact.id, status: { not: ArtifactStatus.READY } },
      data: {
        status: ArtifactStatus.READY,
        pdfData: new Uint8Array(pdf),
        sha256: sha256Hex(pdf),
        attempts: { increment: 1 },
        lastError: null,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Executed PDF generation failed for agreement ${documentId}: ${message}`);
    await prisma.documentArtifact.updateMany({
      where: { id: artifact.id, status: { not: ArtifactStatus.READY } },
      data: {
        status: ArtifactStatus.FAILED,
        attempts: { increment: 1 },
        lastError: message.slice(0, 500),
      },
    });
  }

  return prisma.documentArtifact.findUniqueOrThrow({
    where: { id: artifact.id },
    select: { id: true, status: true, sha256: true },
  });
}

// ---------------------------------------------------------------------------
// The PDF to show for an agreement: executed if READY, otherwise the frozen
// copy, otherwise the draft preview. An executed agreement whose PDF is not
// READY gets another (idempotent) generation attempt first.

export async function loadAgreementPdf(
  documentId: string,
): Promise<{ pdf: Uint8Array; title: string } | { pending: true } | null> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { title: true, status: true, pdfData: true },
  });
  if (!document) return null;

  if (document.status === DocumentStatus.FULLY_EXECUTED) {
    const hasExecutedArtifact = await prisma.documentArtifact.count({
      where: { documentId, kind: ArtifactKind.EXECUTED },
    });
    // Agreements executed before artifacts existed may have none; they fall
    // through to whatever PDF they stored.
    if (hasExecutedArtifact) {
      const executed = await generateExecutedArtifact(documentId);
      if (executed.status !== ArtifactStatus.READY) return { pending: true };
    }
  }

  const artifacts = await prisma.documentArtifact.findMany({
    where: { documentId, status: ArtifactStatus.READY },
    select: { kind: true, pdfData: true },
  });
  const chosen =
    artifacts.find((a) => a.kind === ArtifactKind.EXECUTED) ??
    artifacts.find((a) => a.kind === ArtifactKind.FROZEN);
  const pdf = chosen?.pdfData ?? document.pdfData;
  return pdf ? { pdf: new Uint8Array(pdf), title: document.title } : null;
}
