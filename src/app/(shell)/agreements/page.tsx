import type { Metadata } from "next";
import Link from "next/link";
import { Ban, CircleCheck, FilePen, Files, Hourglass, PenLine, Plus, Send, type LucideIcon } from "lucide-react";
import { requireUser } from "@/lib/session";
import { listAgreements } from "@/lib/queries";
import { buildQueue, parseView, VIEW_LABELS, type Queue, type QueueView } from "@/lib/queue";
import type { TemplateType } from "@/generated/prisma/enums";
import { AgreementRow, QueueHeader } from "@/components/agreements/AgreementRow";
import { QueueTabs } from "@/components/agreements/QueueTabs";
import { EmptyState } from "@/components/ui/EmptyState";
import { buttonClasses } from "@/components/ui/button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Agreements · Countersign" };

const EMPTY: Record<QueueView, { icon: LucideIcon; title: string; body: string }> = {
  "needs-countersign": {
    icon: PenLine,
    title: "Nothing needs your countersignature",
    body: "An agreement appears here once its counterparty has signed, if you are its designated countersigner.",
  },
  "waiting-counterparty": {
    icon: Send,
    title: "No agreements are waiting on a counterparty",
    body: "Sent agreements stay here until the counterparty signs through their link.",
  },
  "waiting-countersign": {
    icon: Hourglass,
    title: "Nothing is waiting on another countersigner",
    body: "Agreements the counterparty has signed, for another signatory to countersign, appear here.",
  },
  drafts: {
    icon: FilePen,
    title: "No drafts",
    body: "A new agreement stays here until it is sent for signature.",
  },
  executed: {
    icon: CircleCheck,
    title: "No executed agreements yet",
    body: "An agreement is executed when the company countersigns after the counterparty.",
  },
  voided: {
    icon: Ban,
    title: "No voided agreements",
    body: "Voiding stops an agreement before execution; it is final.",
  },
  all: {
    icon: Files,
    title: "No agreements yet",
    body: "Create one, send it to a counterparty, and countersign once they have signed.",
  },
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// The current workload in words, instead of metric cards: first what is
// waiting on you, then what is waiting on others.
function Workload({ counts }: { counts: Queue["counts"] }) {
  const mine = counts["needs-countersign"];
  const others = [
    counts["waiting-counterparty"] > 0 &&
      plural(counts["waiting-counterparty"], "with a counterparty", "with counterparties"),
    counts["waiting-countersign"] > 0 &&
      plural(counts["waiting-countersign"], "with another countersigner", "with other countersigners"),
    counts.drafts > 0 && plural(counts.drafts, "draft", "drafts"),
  ].filter((part): part is string => Boolean(part));

  return (
    <div className="mt-2">
      <p className="text-base text-paper">
        {mine > 0 ? (
          <>
            <span className="font-semibold text-signal">{plural(mine, "agreement", "agreements")}</span>{" "}
            {mine === 1 ? "needs" : "need"} your countersignature.
          </>
        ) : counts.all > 0 ? (
          "Nothing needs your countersignature."
        ) : (
          "No agreements yet."
        )}
      </p>
      {others.length > 0 && <p className="mt-0.5 text-sm text-slate">Also {others.join(" · ")}.</p>}
    </div>
  );
}

export default async function AgreementsPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const { user } = await requireUser();
  const requested = parseView((await searchParams)?.view);
  const agreements = await listAgreements();
  const now = new Date();
  const queue = buildQueue(agreements, user.id, now);
  const view = requested ?? queue.defaultView;
  const rows = queue.rows[view];
  const templates = new Map<string, TemplateType>(agreements.map((a) => [a.id, a.templateType]));
  const empty = EMPTY[view];
  const nothingToCountersign = queue.counts["needs-countersign"] === 0;

  return (
    <div className="w-full max-w-[76rem] px-4 pt-6 pb-16 sm:px-6 lg:px-10 lg:pt-10">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-[family-name:var(--font-display)] text-2xl leading-tight font-semibold tracking-tight text-paper lg:text-[1.75rem]">
            Agreements
          </h1>
          <Workload counts={queue.counts} />
        </div>
        {/* The page's primary action, unless something is waiting on you.
            Shares the heading row at every width; "New" on phones. */}
        <Link
          href="/agreements/new"
          aria-label="New agreement"
          className={buttonClasses(nothingToCountersign ? "primary" : "secondary", "md", "max-sm:px-3")}
        >
          <Plus aria-hidden />
          <span className="sm:hidden">New</span>
          <span className="hidden sm:inline">New agreement</span>
        </Link>
      </header>

      <div className="mt-7">
        <QueueTabs active={view} counts={queue.counts} />
      </div>

      <section aria-labelledby="queue-heading">
        <h2 id="queue-heading" className="sr-only">
          {VIEW_LABELS[view]}
        </h2>
        {rows.length > 0 ? (
          <>
            <QueueHeader />
            <ol className="divide-y divide-panel-border border-b border-panel-border">
            {rows.map((row) => (
              <AgreementRow
                key={row.agreement.id}
                row={row}
                templateType={templates.get(row.agreement.id)!}
                now={now}
              />
            ))}
            </ol>
          </>
        ) : (
          <EmptyState
            icon={empty.icon}
            title={empty.title}
            action={
              view === "drafts" || view === "all" ? (
                <Link href="/agreements/new" className={buttonClasses("secondary", "sm")}>
                  <Plus aria-hidden />
                  New agreement
                </Link>
              ) : undefined
            }
          >
            {empty.body}
          </EmptyState>
        )}
      </section>
    </div>
  );
}
