import type { DocumentStatus } from "@/generated/prisma/enums";
import { canManage } from "@/lib/permissions";

// What the agreement page says and offers, decided in one place and tested
// directly (no database, no rendering):
//
//   - the sequence rail: send → counterparty signs → company countersigns,
//     each step naming who acted or who is awaited, in plain language;
//   - a headline: where the agreement stands, for this viewer;
//   - exactly one next action for this viewer (or none, with the reason).

export type Viewer = { id: string; senderId: string; isSignatory: boolean };

export type AgreementFacts = {
  id: string;
  status: DocumentStatus;
  createdAt: Date;
  sentAt: Date | null;
  counterpartySignedAt: Date | null;
  countersignedAt: Date | null;
  voidedAt: Date | null;
  voidReason: string | null;
  voidedByName: string | null;
  senderId: string;
  senderName: string;
  countersignerId: string | null;
  countersignerName: string | null;
  countersignerIsSignatory: boolean;
  counterpartyName: string;
  activeLink: { expiresAt: Date; firstViewedAt: Date | null } | null;
  executedPdf: "ready" | "pending" | "failed" | "none";
  // The counterparty's current signing link, if this viewer may see it and
  // it still works (from the outbox; see linkDisplay).
  shareablePath: string | null;
};

export type StepState = "done" | "current" | "ahead" | "stopped";

export type RailStep = {
  key: "send" | "counterparty" | "countersign";
  // Who the step belongs to, e.g. "Jordan Vance" — with "(you)" when it is
  // the viewer.
  actor: string;
  // What the step is, in the state it is in: "Sent", "Signs first", ...
  title: string;
  detail: string | null;
  at: Date | null;
  state: StepState;
};

export type Outcome =
  | { kind: "executed"; at: Date }
  | { kind: "voided"; at: Date; by: string; reason: string; afterStep: number }
  | { kind: "open" };

export type NextAction =
  | { kind: "send" }
  | { kind: "share-link"; path: string }
  | { kind: "reissue"; reason: "expired" | "missing" }
  | { kind: "countersign"; href: string }
  | { kind: "download"; href: string }
  | { kind: "pdf-pending"; href: string }
  | { kind: "none" };

export type AgreementView = {
  steps: RailStep[];
  outcome: Outcome;
  tone: "action" | "waiting" | "attention" | "neutral" | "done" | "void";
  headline: string;
  // One or two sentences: what happened last and what happens next.
  explanation: string;
  action: NextAction;
  // Secondary actions this viewer may take (never more than these).
  canReissue: boolean;
  canVoid: boolean;
  viewerIsCountersigner: boolean;
  viewerManages: boolean;
};

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const day = (d: Date) => DATE.format(d);

function withYou(name: string, isViewer: boolean) {
  return isViewer ? `${name} (you)` : name;
}

export function agreementView(f: AgreementFacts, viewer: Viewer, now: Date = new Date()): AgreementView {
  const viewerManages = canManage(viewer, f);
  const viewerIsCountersigner = f.countersignerId === viewer.id;
  const countersigner = f.countersignerName ?? "the countersigner";
  const counterparty = f.counterpartyName;
  const link = f.activeLink;
  const linkExpired = Boolean(link && link.expiresAt <= now);

  // --- Steps -------------------------------------------------------------
  const sendDone = f.sentAt !== null;
  const counterpartyDone = f.counterpartySignedAt !== null;
  const countersignDone = f.countersignedAt !== null;
  const voided = f.status === "VOIDED";
  const reached = countersignDone ? 3 : counterpartyDone ? 2 : sendDone ? 1 : 0;

  const stateOf = (index: number, done: boolean): StepState => {
    if (done) return "done";
    if (voided) return index === reached ? "stopped" : "ahead";
    return index === reached ? "current" : "ahead";
  };

  const send: RailStep = {
    key: "send",
    actor: withYou(f.senderName, viewer.senderId === f.senderId),
    title: sendDone ? `Sent to ${counterparty}` : "Prepares and sends",
    detail: sendDone ? null : "Not sent yet",
    at: f.sentAt,
    state: stateOf(0, sendDone),
  };

  let counterpartyDetail: string | null = null;
  if (!counterpartyDone && sendDone && !voided) {
    counterpartyDetail = !link
      ? "No active signing link"
      : linkExpired
        ? `Signing link expired ${day(link.expiresAt)}`
        : link.firstViewedAt
          ? `Opened their link ${day(link.firstViewedAt)} · expires ${day(link.expiresAt)}`
          : `Link not opened yet · expires ${day(link.expiresAt)}`;
  }
  const counterpartyStep: RailStep = {
    key: "counterparty",
    actor: counterparty,
    title: counterpartyDone ? "Signed first" : "Signs first",
    detail: counterpartyDone ? "Through their private signing link" : counterpartyDetail,
    at: f.counterpartySignedAt,
    state: stateOf(1, counterpartyDone),
  };

  const countersignStep: RailStep = {
    key: "countersign",
    actor: withYou(countersigner, viewerIsCountersigner),
    title: countersignDone ? "Countersigned" : "Countersigns second",
    detail: countersignDone ? null : "Designated company signatory",
    at: f.countersignedAt,
    state: stateOf(2, countersignDone),
  };

  const steps = [send, counterpartyStep, countersignStep];

  // --- Outcome, headline and the one next action -------------------------
  const outcome: Outcome = voided
    ? {
        kind: "voided",
        at: f.voidedAt ?? now,
        by: f.voidedByName ?? "a company user",
        reason: f.voidReason ?? "",
        afterStep: reached,
      }
    : countersignDone && f.countersignedAt
      ? { kind: "executed", at: f.countersignedAt }
      : { kind: "open" };

  const base = {
    steps,
    outcome,
    viewerManages,
    viewerIsCountersigner,
    canReissue: false,
    canVoid: viewerManages && !voided && f.status !== "FULLY_EXECUTED",
  };
  const pdfHref = `/api/documents/${f.id}/pdf`;

  switch (f.status) {
    case "DRAFT":
      return {
        ...base,
        tone: "neutral",
        headline: "Draft — not sent yet",
        explanation: `Once sent, ${counterparty} signs first through a private link, then ${countersigner} countersigns.`,
        action: viewerManages ? { kind: "send" } : { kind: "none" },
      };

    case "SENT": {
      const needsNewLink = !link || linkExpired;
      return {
        ...base,
        tone: needsNewLink ? "attention" : "waiting",
        headline: `Waiting on ${counterparty} to sign`,
        explanation: needsNewLink
          ? `${counterparty} has no working signing link${linkExpired && link ? ` — it expired ${day(link.expiresAt)}` : ""}. Issue a new one to continue.`
          : `They sign first. ${countersigner} can countersign only after they have.`,
        canReissue: viewerManages,
        action: !viewerManages
          ? { kind: "none" }
          : needsNewLink
            ? { kind: "reissue", reason: linkExpired ? "expired" : "missing" }
            : f.shareablePath
              ? { kind: "share-link", path: f.shareablePath }
              : { kind: "reissue", reason: "missing" },
      };
    }

    case "PARTIALLY_SIGNED": {
      const mine = viewerIsCountersigner && viewer.isSignatory && f.countersignerIsSignatory;
      return {
        ...base,
        tone: mine ? "action" : "waiting",
        headline: mine ? "Ready for your countersignature" : `Waiting on ${countersigner} to countersign`,
        explanation: mine
          ? `${counterparty} signed${f.counterpartySignedAt ? ` on ${day(f.counterpartySignedAt)}` : ""}. You are the designated countersigner; countersigning executes the agreement.`
          : viewerIsCountersigner
            ? "Your account is no longer authorized to countersign. Ask an administrator to restore your signatory role."
            : `${counterparty} signed. Only ${countersigner}, the designated company signatory, can countersign.`,
        action: mine ? { kind: "countersign", href: `/agreements/${f.id}/countersign` } : { kind: "none" },
      };
    }

    case "FULLY_EXECUTED":
      return {
        ...base,
        tone: "done",
        headline: `Executed on ${day(f.countersignedAt ?? now)}`,
        explanation: `Signed in order: ${counterparty} first, then ${countersigner}.`,
        action:
          f.executedPdf === "ready" || f.executedPdf === "none"
            ? { kind: "download", href: pdfHref }
            : { kind: "pdf-pending", href: pdfHref },
      };

    case "VOIDED":
      return {
        ...base,
        tone: "void",
        headline: `Voided on ${day(f.voidedAt ?? now)}`,
        explanation: `${f.voidedByName ?? "A company user"} voided it${
          // No second full stop after a reason that already ends a sentence.
          f.voidReason ? `: “${f.voidReason}”${/[.!?]$/.test(f.voidReason) ? "" : "."}` : "."
        } It can no longer be signed.`,
        action: { kind: "none" },
      };
  }
}
