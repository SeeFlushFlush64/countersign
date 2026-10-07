import type { DocumentStatus } from "@/generated/prisma/enums";

// The agreements queue: which view an agreement belongs to for a given
// viewer, what to say about it, and in what order. Pure (no database), so
// the rules are unit-tested directly.
//
// The views follow the signing sequence. "Needs your countersign" is the
// only one that asks the viewer to act, and only the designated
// countersigner ever sees an agreement there.

export const QUEUE_VIEWS = [
  "needs-countersign",
  "waiting-counterparty",
  "waiting-countersign",
  "drafts",
  "executed",
  "voided",
  "all",
] as const;

export type QueueView = (typeof QUEUE_VIEWS)[number];
export type AgreementView = Exclude<QueueView, "all">;

export const VIEW_LABELS: Record<QueueView, string> = {
  "needs-countersign": "Needs your countersign",
  "waiting-counterparty": "With counterparty",
  "waiting-countersign": "With countersigner",
  drafts: "Drafts",
  executed: "Executed",
  voided: "Voided",
  all: "All",
};

export type QueueAgreement = {
  id: string;
  title: string;
  status: DocumentStatus;
  createdAt: Date;
  sentAt: Date | null;
  counterpartySignedAt: Date | null;
  countersignedAt: Date | null;
  voidedAt: Date | null;
  voidReason: string | null;
  counterpartyName: string;
  countersignerId: string | null;
  countersignerName: string | null;
  senderName: string;
  activeLink: { expiresAt: Date; firstViewedAt: Date | null } | null;
};

export function viewOf(agreement: QueueAgreement, viewerId: string): AgreementView {
  switch (agreement.status) {
    case "DRAFT":
      return "drafts";
    case "SENT":
      return "waiting-counterparty";
    case "PARTIALLY_SIGNED":
      return agreement.countersignerId === viewerId ? "needs-countersign" : "waiting-countersign";
    case "FULLY_EXECUTED":
      return "executed";
    case "VOIDED":
      return "voided";
  }
}

// Order of the "All" view, and of views relative to each other: what the
// viewer must do first, then what is in flight, then what is settled.
const PRIORITY: Record<AgreementView, number> = {
  "needs-countersign": 0,
  "waiting-counterparty": 1,
  "waiting-countersign": 2,
  drafts: 3,
  executed: 4,
  voided: 5,
};

export function lastActivityAt(a: QueueAgreement): Date {
  const times = [a.createdAt, a.sentAt, a.counterpartySignedAt, a.countersignedAt, a.voidedAt];
  return new Date(Math.max(...times.filter((t): t is Date => t !== null).map((t) => t.getTime())));
}

// Tone of the state line: `action` asks the viewer to act, `attention` flags
// something stuck (an expired or missing link), the rest is informational.
export type Tone = "action" | "attention" | "waiting" | "neutral" | "done" | "void";

// Sequence progress: how many of the three steps (sent, counterparty signed,
// countersigned) are complete.
export type QueueRow = {
  agreement: QueueAgreement;
  view: AgreementView;
  tone: Tone;
  headline: string;
  // Supporting line, e.g. "Petrel Logistics Co. signed · 4 days ago". `at`
  // is rendered as relative time after the text, with an optional prefix
  // ("expires Oct 19").
  detail: Detail | null;
  steps: 0 | 1 | 2 | 3;
  // The one action this row offers inline, if any.
  action: { label: string; href: string } | null;
};

export type Detail = { text: string; at?: Date; atPrefix?: string };

function linkDetail(a: QueueAgreement, now: Date): Detail & { tone: Tone } {
  const link = a.activeLink;
  if (!link) return { tone: "attention", text: "No active signing link — reissue one" };
  if (link.expiresAt <= now) {
    return { tone: "attention", text: "Signing link expired", at: link.expiresAt };
  }
  if (link.firstViewedAt) return { tone: "waiting", text: "Link opened", at: link.firstViewedAt };
  return { tone: "waiting", text: "Link not opened yet", at: link.expiresAt, atPrefix: "expires" };
}

export function rowFor(a: QueueAgreement, viewerId: string, now: Date = new Date()): QueueRow {
  const view = viewOf(a, viewerId);
  const base = { agreement: a, view, action: null };
  switch (view) {
    case "needs-countersign":
      return {
        ...base,
        tone: "action",
        headline: "Ready for your countersignature",
        detail: { text: `${a.counterpartyName} signed`, at: a.counterpartySignedAt ?? undefined },
        steps: 2,
        action: { label: "Countersign", href: `/agreements/${a.id}/countersign` },
      };
    case "waiting-countersign":
      return {
        ...base,
        tone: "waiting",
        headline: `Waiting on ${a.countersignerName ?? "the countersigner"} to countersign`,
        detail: { text: `${a.counterpartyName} signed`, at: a.counterpartySignedAt ?? undefined },
        steps: 2,
      };
    case "waiting-counterparty": {
      const link = linkDetail(a, now);
      return {
        ...base,
        tone: link.tone,
        headline: `Waiting on ${a.counterpartyName} to sign`,
        detail: { text: link.text, at: link.at, atPrefix: link.atPrefix },
        steps: 1,
      };
    }
    case "drafts":
      return {
        ...base,
        tone: "neutral",
        headline: "Draft — not sent yet",
        detail: { text: "Created", at: a.createdAt },
        steps: 0,
      };
    case "executed":
      return {
        ...base,
        tone: "done",
        headline: "Executed",
        detail: a.countersignerName
          ? { text: `Countersigned by ${a.countersignerName}`, at: a.countersignedAt ?? undefined }
          : { text: "Countersigned", at: a.countersignedAt ?? undefined },
        steps: 3,
      };
    case "voided":
      return {
        ...base,
        tone: "void",
        headline: "Voided",
        detail: { text: truncate(a.voidReason ?? "No reason recorded", 90), at: a.voidedAt ?? undefined },
        steps: a.counterpartySignedAt ? 2 : a.sentAt ? 1 : 0,
      };
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export type Queue = {
  counts: Record<QueueView, number>;
  rows: Record<QueueView, QueueRow[]>;
  defaultView: QueueView;
};

export function buildQueue(
  agreements: QueueAgreement[],
  viewerId: string,
  now: Date = new Date(),
): Queue {
  const all = agreements.map((a) => rowFor(a, viewerId, now));
  const byActivity = (x: QueueRow, y: QueueRow) =>
    lastActivityAt(y.agreement).getTime() - lastActivityAt(x.agreement).getTime();
  // Countersigning is first-come, first-served: the longest-waiting first.
  const oldestSignedFirst = (x: QueueRow, y: QueueRow) =>
    (x.agreement.counterpartySignedAt?.getTime() ?? 0) - (y.agreement.counterpartySignedAt?.getTime() ?? 0);

  const rows = Object.fromEntries(QUEUE_VIEWS.map((view) => [view, [] as QueueRow[]])) as Record<
    QueueView,
    QueueRow[]
  >;
  for (const row of all) rows[row.view].push(row);
  for (const view of QUEUE_VIEWS) {
    if (view === "all") continue;
    rows[view].sort(view === "needs-countersign" ? oldestSignedFirst : byActivity);
  }
  rows.all = [...all].sort((x, y) => PRIORITY[x.view] - PRIORITY[y.view] || byActivity(x, y));

  const counts = Object.fromEntries(QUEUE_VIEWS.map((view) => [view, rows[view].length])) as Record<
    QueueView,
    number
  >;
  return { counts, rows, defaultView: counts["needs-countersign"] > 0 ? "needs-countersign" : "all" };
}

export function parseView(value: unknown): QueueView | null {
  return typeof value === "string" && (QUEUE_VIEWS as readonly string[]).includes(value)
    ? (value as QueueView)
    : null;
}
