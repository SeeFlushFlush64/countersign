import { prisma } from "@/lib/prisma";
import type { Prisma } from "@/generated/prisma/client";
import { renderDocumentHtml, renderFooterHtml } from "@/lib/pdf/template";
import { renderHtmlToPdf } from "@/lib/pdf/render";
import { buildExecutedPdf } from "@/lib/pdf/execution-page";
import { COMPANY_NAME, COMPANY_ADDRESS } from "@/lib/pdf/content";
import { ROLE_LABELS } from "@/lib/labels";
import { formatLongDate } from "@/lib/format";
import { sha256Hex } from "@/lib/hash";
import { InvalidSignatureError, toDataUrl, validateSignature } from "@/lib/signature";
import { agreementInputSchema, firstIssue, voidReasonSchema } from "@/lib/validation";
import {
  hashSigningToken,
  isWellFormedToken,
  linkExpiry,
  newSigningToken,
  receiptWindowEnd,
} from "@/lib/signing-links";
import {
  ActorType,
  ArtifactKind,
  ArtifactStatus,
  DocumentStatus,
  LinkRevocationReason,
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
//      to change, then write the signer row, link, artifact and audit event.
//
// Two concurrent requests for the same transition therefore cannot both
// succeed: Postgres serializes the row update, the loser re-checks the WHERE
// clause against the committed row, matches nothing, and its transaction
// rolls back. CHECK constraints in the database back up the ordering, void
// and link rules independently of this code. Transactions that touch both an
// agreement and its signing link always lock the agreement row first.

export type FlowErrorCode = "NOT_FOUND" | "FORBIDDEN" | "CONFLICT" | "INVALID" | "LINK_INVALID";

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

// An authenticated company user, as established by the session — never by
// anything the client sends.
export type Actor = { userId: string };

// Request facts captured on the server for counterparty actions.
export type AuditContext = { ipHash?: string | null; userAgent?: string | null };

export const ORDER_VIOLATION_MESSAGE =
  "The counterparty must sign before the company can countersign.";

const LINK_MESSAGES = {
  notFound: "This signing link is not valid.",
  superseded:
    "This signing link has been replaced by a newer one. Use the most recent link you received.",
  voided: "This agreement was voided by the sender and can no longer be signed.",
  expired: "This signing link has expired. Ask the sender for a new link.",
  used: "This signing link is no longer valid.",
} as const;

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
// Audit events (append-only; a trigger rejects UPDATE and DELETE)

type AuditActor =
  | { type: "USER"; userId: string; name: string }
  | { type: "COUNTERPARTY_LINK"; linkId: string; name: string }
  | { type: "SYSTEM"; name?: string };

async function audit(
  tx: Prisma.TransactionClient,
  documentId: string,
  eventType: StatusEventType,
  actor: AuditActor,
  timestamp: Date,
  extra: { signingLinkId?: string; metadata?: Record<string, unknown> } = {},
) {
  await tx.statusEvent.create({
    data: {
      documentId,
      eventType,
      timestamp,
      actor: actor.name ?? "Countersign",
      actorType: ActorType[actor.type],
      actorUserId: actor.type === "USER" ? actor.userId : null,
      signingLinkId: actor.type === "COUNTERPARTY_LINK" ? actor.linkId : (extra.signingLinkId ?? null),
      metadata: extra.metadata as Prisma.InputJsonValue | undefined,
    },
  });
}

function contextMetadata(context: AuditContext) {
  return { ipHash: context.ipHash ?? null, userAgent: context.userAgent ?? null };
}

// ---------------------------------------------------------------------------
// Company users

async function companyUser(actor: Actor) {
  return prisma.user.findUnique({ where: { id: actor.userId }, include: { sender: true } });
}

// The sender's own login or the designated countersigner may manage an
// agreement (send, reissue its link, void it).
function canManage(
  user: { id: string; senderId: string } | null,
  document: { senderId: string; countersignerId: string | null },
): user is { id: string; senderId: string } {
  return Boolean(user && (user.senderId === document.senderId || user.id === document.countersignerId));
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
    // The signed-in user creating it; omitted only by the seed (SYSTEM).
    createdByUserId?: string;
  },
  { now = new Date() }: Clock = {},
) {
  const parsed = agreementInputSchema.safeParse(input);
  if (!parsed.success) throw new DocumentFlowError(firstIssue(parsed.error), "INVALID");
  const { title, counterpartyName, counterpartyEmail } = parsed.data;

  const [sender, countersigner, creator] = await Promise.all([
    prisma.sender.findUniqueOrThrow({ where: { id: input.senderId } }),
    prisma.user.findUnique({
      where: { id: input.countersignerId },
      include: { sender: true },
    }),
    input.createdByUserId
      ? prisma.user.findUnique({ where: { id: input.createdByUserId } })
      : Promise.resolve(null),
  ]);
  if (!countersigner?.isSignatory) {
    throw new DocumentFlowError("Choose a company signatory to countersign.", "INVALID");
  }
  if (input.createdByUserId && creator?.senderId !== input.senderId) {
    throw new DocumentFlowError("You can only create agreements as yourself.", "FORBIDDEN");
  }

  const document = await prisma.$transaction(async (tx) => {
    const created = await tx.document.create({
      data: {
        createdAt: now,
        title,
        templateType: input.templateType,
        senderId: input.senderId,
        countersignerId: countersigner.id,
        counterpartyName,
        counterpartyEmail,
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
              name: counterpartyName,
              email: counterpartyEmail,
            },
          ],
        },
      },
    });
    await audit(
      tx,
      created.id,
      StatusEventType.CREATED,
      creator
        ? { type: "USER", userId: creator.id, name: sender.name }
        : { type: "SYSTEM", name: "Countersign (seed)" },
      now,
    );
    return created;
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
// Signing links: issue (inside a caller's transaction)

async function issueSigningLink(
  tx: Prisma.TransactionClient,
  documentId: string,
  issuedById: string,
  now: Date,
) {
  const counterparty = await tx.signer.findUniqueOrThrow({
    where: { documentId_partyRole: { documentId, partyRole: PartyRole.COUNTERPARTY } },
    select: { id: true },
  });
  const { token, tokenHash } = newSigningToken();
  const link = await tx.signingLink.create({
    data: {
      documentId,
      signerId: counterparty.id,
      tokenHash,
      issuedById,
      createdAt: now,
      expiresAt: linkExpiry(now),
      // Unique: a second active link for the same agreement is rejected.
      activeDocumentId: documentId,
    },
    select: { id: true, expiresAt: true },
  });
  return { token, linkId: link.id, expiresAt: link.expiresAt };
}

// ---------------------------------------------------------------------------
// Send: DRAFT → SENT, freezing the agreement and its SHA-256 and issuing the
// counterparty's signing link (its token is returned once, here)

export async function sendDocument(
  documentId: string,
  actor: Actor,
  clock: Clock = {},
) {
  const [document, user] = await Promise.all([
    prisma.document.findUnique({ where: { id: documentId } }),
    companyUser(actor),
  ]);
  if (!document) throw new DocumentFlowError("Agreement not found.", "NOT_FOUND");
  if (!canManage(user, document)) {
    throw new DocumentFlowError(
      "Only the sender or the designated countersigner can send this agreement.",
      "FORBIDDEN",
    );
  }
  if (document.status === DocumentStatus.VOIDED) {
    throw new DocumentFlowError("This agreement was voided.");
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

  return inTransition("This agreement has already been sent.", () =>
    prisma.$transaction(async (tx) => {
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
      const link = await issueSigningLink(tx, documentId, user.id, now);
      await audit(
        tx,
        documentId,
        StatusEventType.SENT,
        { type: "USER", userId: user.id, name: user.sender.name },
        now,
        { signingLinkId: link.linkId, metadata: { linkExpiresAt: link.expiresAt.toISOString() } },
      );
      return { frozenSha256, signingToken: link.token, signingLinkId: link.linkId };
    }),
  );
}

// ---------------------------------------------------------------------------
// Reissue: revoke the active link (if any) and issue a new one. The old link
// stops working the moment this commits.
//
// The caller names the link it is replacing (expectedLinkId, null if the
// agreement has none). Only one request can replace a given link, so a
// double-click or concurrent reissues produce exactly one new link and one
// LINK_REISSUED event; every other request fails with a clean conflict
// (the winner's token cannot be handed out again — only its hash exists).

export const REISSUE_CONFLICT_MESSAGE =
  "This signing link was already reissued. Use the newest link, or reload and reissue again.";

export async function reissueSigningLink(
  documentId: string,
  actor: Actor,
  { expectedLinkId }: { expectedLinkId: string | null },
  clock: Clock = {},
) {
  const [document, user] = await Promise.all([
    prisma.document.findUnique({ where: { id: documentId } }),
    companyUser(actor),
  ]);
  if (!document) throw new DocumentFlowError("Agreement not found.", "NOT_FOUND");
  if (!canManage(user, document)) {
    throw new DocumentFlowError(
      "Only the sender or the designated countersigner can reissue the signing link.",
      "FORBIDDEN",
    );
  }
  if (document.status === DocumentStatus.VOIDED) {
    throw new DocumentFlowError("This agreement was voided.");
  }
  if (document.status !== DocumentStatus.SENT) {
    throw new DocumentFlowError(
      "A signing link can only be reissued while waiting on the counterparty.",
    );
  }

  const now = clock.now ?? new Date();
  return inTransition(REISSUE_CONFLICT_MESSAGE, () =>
    prisma.$transaction(async (tx) => {
      // Locks the agreement row (a no-op write) so a concurrent counterparty
      // signature, void or reissue serializes with this one.
      const locked = await tx.document.updateMany({
        where: { id: documentId, status: DocumentStatus.SENT },
        data: { status: DocumentStatus.SENT },
      });
      requireOneRow(locked.count, "This agreement is no longer waiting on the counterparty.");

      // Re-read under the lock: the active link must still be the one the
      // caller saw. A request that lost a race sees the winner's link here.
      const current = await tx.signingLink.findUnique({
        where: { activeDocumentId: documentId },
        select: { id: true },
      });
      if ((current?.id ?? null) !== expectedLinkId) {
        throw new DocumentFlowError(REISSUE_CONFLICT_MESSAGE);
      }
      if (current) {
        const revoked = await tx.signingLink.updateMany({
          where: { id: current.id, revokedAt: null },
          data: {
            revokedAt: now,
            revokedReason: LinkRevocationReason.SUPERSEDED,
            activeDocumentId: null,
          },
        });
        requireOneRow(revoked.count, REISSUE_CONFLICT_MESSAGE);
      }

      const link = await issueSigningLink(tx, documentId, user.id, now);
      if (current) {
        await tx.signingLink.update({
          where: { id: current.id },
          data: { replacedById: link.linkId },
        });
      }
      await audit(
        tx,
        documentId,
        StatusEventType.LINK_REISSUED,
        { type: "USER", userId: user.id, name: user.sender.name },
        now,
        {
          signingLinkId: link.linkId,
          metadata: {
            replacedLinkId: current?.id ?? null,
            linkExpiresAt: link.expiresAt.toISOString(),
          },
        },
      );
      return { signingToken: link.token, signingLinkId: link.linkId };
    }),
  );
}

// ---------------------------------------------------------------------------
// Void: DRAFT / SENT / PARTIALLY_SIGNED → VOIDED (terminal). Requires a reason
// and revokes the signing link. The signing timestamps keep what had
// happened before the void.

const VOIDABLE = [DocumentStatus.DRAFT, DocumentStatus.SENT, DocumentStatus.PARTIALLY_SIGNED];

export async function voidDocument(
  documentId: string,
  actor: Actor,
  reason: unknown,
  clock: Clock = {},
) {
  const parsedReason = voidReasonSchema.safeParse(reason);
  if (!parsedReason.success) {
    throw new DocumentFlowError(firstIssue(parsedReason.error), "INVALID");
  }

  const [document, user] = await Promise.all([
    prisma.document.findUnique({ where: { id: documentId } }),
    companyUser(actor),
  ]);
  if (!document) throw new DocumentFlowError("Agreement not found.", "NOT_FOUND");
  if (!canManage(user, document)) {
    throw new DocumentFlowError(
      "Only the sender or the designated countersigner can void this agreement.",
      "FORBIDDEN",
    );
  }
  if (document.status === DocumentStatus.VOIDED) {
    throw new DocumentFlowError("This agreement was already voided.");
  }
  if (document.status === DocumentStatus.FULLY_EXECUTED) {
    throw new DocumentFlowError("An executed agreement cannot be voided.");
  }

  const now = clock.now ?? new Date();
  const conflict = "This agreement was executed or voided in the meantime.";
  await inTransition(conflict, () =>
    prisma.$transaction(async (tx) => {
      const voided = await tx.document.updateMany({
        where: { id: documentId, status: { in: VOIDABLE } },
        data: {
          status: DocumentStatus.VOIDED,
          voidedAt: now,
          voidReason: parsedReason.data,
          voidedById: user.id,
        },
      });
      requireOneRow(voided.count, conflict);

      await tx.signingLink.updateMany({
        where: { documentId, revokedAt: null },
        data: { revokedAt: now, revokedReason: LinkRevocationReason.VOIDED, activeDocumentId: null },
      });
      await audit(
        tx,
        documentId,
        StatusEventType.VOIDED,
        { type: "USER", userId: user.id, name: user.sender.name },
        now,
        { metadata: { reason: parsedReason.data, statusBeforeVoid: document.status } },
      );
    }),
  );
}

// ---------------------------------------------------------------------------
// Resolving a signing link: what the holder of a token may see and do

export type LinkView =
  | { state: "not_found" }
  | { state: "superseded" }
  | { state: "voided" }
  | { state: "expired"; expiredAt: Date }
  | {
      state: "valid";
      linkId: string;
      expiresAt: Date;
      document: {
        id: string;
        title: string;
        templateType: TemplateType;
        status: DocumentStatus;
        frozenSha256: string | null;
        senderName: string;
      };
      signer: { name: string; signedAt: Date | null };
    };

export async function resolveSigningLink(token: unknown, now = new Date()): Promise<LinkView> {
  if (!isWellFormedToken(token)) return { state: "not_found" };
  const link = await prisma.signingLink.findUnique({
    where: { tokenHash: hashSigningToken(token) },
    include: {
      signer: { select: { name: true, signedAt: true } },
      document: {
        select: {
          id: true,
          title: true,
          templateType: true,
          status: true,
          frozenSha256: true,
          sender: { select: { name: true } },
        },
      },
    },
  });
  if (!link) return { state: "not_found" };
  if (
    link.revokedReason === LinkRevocationReason.VOIDED ||
    link.document.status === DocumentStatus.VOIDED
  ) {
    return { state: "voided" };
  }
  if (link.revokedAt) return { state: "superseded" };
  if (link.expiresAt <= now) return { state: "expired", expiredAt: link.expiresAt };

  const d = link.document;
  return {
    state: "valid",
    linkId: link.id,
    expiresAt: link.expiresAt,
    document: {
      id: d.id,
      title: d.title,
      templateType: d.templateType,
      status: d.status,
      frozenSha256: d.frozenSha256,
      senderName: d.sender.name,
    },
    signer: link.signer,
  };
}

function linkErrorFor(view: Exclude<LinkView, { state: "valid" }>): DocumentFlowError {
  return new DocumentFlowError(LINK_MESSAGES[view.state === "not_found" ? "notFound" : view.state], "LINK_INVALID");
}

// ---------------------------------------------------------------------------
// Views: recorded on the server when a valid link's page is served — once per
// link, never from a client-callable action

export async function recordLinkView(
  linkId: string,
  context: AuditContext = {},
  { now = new Date() }: Clock = {},
): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const first = await tx.signingLink.updateMany({
      where: { id: linkId, firstViewedAt: null, revokedAt: null },
      data: { firstViewedAt: now },
    });
    if (first.count !== 1) return false;
    const link = await tx.signingLink.findUniqueOrThrow({
      where: { id: linkId },
      select: { documentId: true, signer: { select: { name: true } } },
    });
    await audit(
      tx,
      link.documentId,
      StatusEventType.VIEWED,
      { type: "COUNTERPARTY_LINK", linkId, name: link.signer.name },
      now,
      { metadata: contextMetadata(context) },
    );
    return true;
  });
}

// ---------------------------------------------------------------------------
// Counterparty signs through their link: SENT → PARTIALLY_SIGNED

export async function signWithLink(
  token: unknown,
  { signature, expectedSha256 }: SignatureSubmission,
  context: AuditContext = {},
  clock: Clock = {},
) {
  const valid = await validSignatureOrFail(signature);

  const view = await resolveSigningLink(token, clock.now ?? new Date());
  if (view.state !== "valid") throw linkErrorFor(view);
  const { document, linkId } = view;

  if (document.status !== DocumentStatus.SENT) {
    throw new DocumentFlowError("This agreement is no longer awaiting your signature.");
  }
  if (!document.frozenSha256 || document.frozenSha256 !== expectedSha256) {
    throw new DocumentFlowError(
      "This agreement changed since you opened it. Reload it and review it again.",
    );
  }

  const now = clock.now ?? new Date();
  await inTransition("This agreement is no longer awaiting your signature.", () =>
    prisma.$transaction(async (tx) => {
      const moved = await tx.document.updateMany({
        where: {
          id: document.id,
          status: DocumentStatus.SENT,
          frozenSha256: expectedSha256,
        },
        data: { status: DocumentStatus.PARTIALLY_SIGNED, counterpartySignedAt: now },
      });
      requireOneRow(moved.count, "This agreement is no longer awaiting your signature.");

      // The link must still be valid at commit time (a concurrent reissue or
      // void revokes it), and is single-use for signing.
      const used = await tx.signingLink.updateMany({
        where: { id: linkId, revokedAt: null, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      requireOneRow(used.count, LINK_MESSAGES.used);

      const link = await tx.signingLink.findUniqueOrThrow({
        where: { id: linkId },
        select: { signerId: true, signer: { select: { name: true } } },
      });
      const signed = await tx.signer.updateMany({
        where: { id: link.signerId, signedAt: null },
        data: { signedAt: now, signatureData: toDataUrl(valid.png) },
      });
      requireOneRow(signed.count, "This signature has already been recorded.");

      await audit(
        tx,
        document.id,
        StatusEventType.SIGNED,
        { type: "COUNTERPARTY_LINK", linkId, name: link.signer.name },
        now,
        { metadata: contextMetadata(context) },
      );
    }),
  );
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
    companyUser(actor),
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
  if (document.status === DocumentStatus.VOIDED) {
    throw new DocumentFlowError("This agreement was voided.");
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
  await inTransition("This agreement has already been executed or was voided.", () =>
    prisma.$transaction(async (tx) => {
      const moved = await tx.document.updateMany({
        where: {
          id: documentId,
          status: DocumentStatus.PARTIALLY_SIGNED,
          countersignerId: user.id,
          frozenSha256: expectedSha256,
        },
        data: { status: DocumentStatus.FULLY_EXECUTED, countersignedAt: now, completedAt: now },
      });
      requireOneRow(moved.count, "This agreement has already been executed or was voided.");

      const signed = await tx.signer.updateMany({
        where: { documentId, partyRole: PartyRole.COMPANY, signedAt: null },
        data: { signedAt: now, signatureData: toDataUrl(valid.png) },
      });
      requireOneRow(signed.count, "The countersignature has already been recorded.");

      await audit(
        tx,
        documentId,
        StatusEventType.SIGNED,
        { type: "USER", userId: user.id, name: user.sender.name },
        now,
      );
      await audit(tx, documentId, StatusEventType.FULLY_EXECUTED, { type: "SYSTEM" }, now);
      await tx.documentArtifact.create({
        data: { documentId, kind: ArtifactKind.EXECUTED, status: ArtifactStatus.PENDING },
      });

      // The counterparty's link stays readable long enough to fetch the
      // executed copy.
      const receiptUntil = receiptWindowEnd(now);
      await tx.signingLink.updateMany({
        where: { documentId, revokedAt: null, expiresAt: { lt: receiptUntil } },
        data: { expiresAt: receiptUntil },
      });
    }),
  );

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
// PDFs. Company users (signed in) see the executed PDF if READY, otherwise
// the frozen copy, otherwise the draft preview. A link holder sees only their
// own agreement, and only what was sent to them (frozen) or the executed
// copy — never a draft. An executed agreement whose PDF is not READY gets
// another (idempotent) generation attempt first.

type PdfResult = { pdf: Uint8Array; title: string } | { pending: true } | null;

async function executedPdfStillPending(documentId: string): Promise<boolean> {
  const hasExecutedArtifact = await prisma.documentArtifact.count({
    where: { documentId, kind: ArtifactKind.EXECUTED },
  });
  // Agreements executed before artifacts existed may have none; they fall
  // through to whatever PDF they stored.
  if (!hasExecutedArtifact) return false;
  const executed = await generateExecutedArtifact(documentId);
  return executed.status !== ArtifactStatus.READY;
}

async function readyArtifact(documentId: string) {
  const artifacts = await prisma.documentArtifact.findMany({
    where: { documentId, status: ArtifactStatus.READY },
    select: { kind: true, pdfData: true },
  });
  return (
    artifacts.find((a) => a.kind === ArtifactKind.EXECUTED) ??
    artifacts.find((a) => a.kind === ArtifactKind.FROZEN)
  );
}

export async function loadAgreementPdf(documentId: string): Promise<PdfResult> {
  const document = await prisma.document.findUnique({
    where: { id: documentId },
    select: { title: true, status: true, pdfData: true },
  });
  if (!document) return null;

  if (document.status === DocumentStatus.FULLY_EXECUTED && (await executedPdfStillPending(documentId))) {
    return { pending: true };
  }
  const pdf = (await readyArtifact(documentId))?.pdfData ?? document.pdfData;
  return pdf ? { pdf: new Uint8Array(pdf), title: document.title } : null;
}

export async function loadLinkPdf(token: unknown, now = new Date()): Promise<PdfResult> {
  const view = await resolveSigningLink(token, now);
  if (view.state !== "valid") return null;
  const { document } = view;

  if (document.status === DocumentStatus.FULLY_EXECUTED && (await executedPdfStillPending(document.id))) {
    return { pending: true };
  }
  const artifact = await readyArtifact(document.id);
  return artifact?.pdfData
    ? { pdf: new Uint8Array(artifact.pdfData), title: document.title }
    : null;
}
