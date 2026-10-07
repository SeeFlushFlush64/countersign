import Link from "next/link";
import {
  Ban,
  CircleCheck,
  FilePen,
  Hourglass,
  PenLine,
  Send,
  TriangleAlert,
  type LucideIcon,
} from "lucide-react";
import type { TemplateType } from "@/generated/prisma/enums";
import type { AgreementView, QueueRow, Tone } from "@/lib/queue";
import { TEMPLATE_TYPE_LABELS } from "@/lib/labels";
import { formatDateTime, formatRelative } from "@/lib/format";
import { buttonClasses } from "@/components/ui/button";
import { SequenceHeader, SequenceSteps } from "./SequenceSteps";

// Wide screens lay the queue out in three aligned columns — the agreement,
// its place in the signing sequence, and the one action it offers — under a
// single header row. Narrower screens stack them inside each row.
export const QUEUE_COLUMNS = "xl:grid xl:grid-cols-[minmax(0,1fr)_20rem_8.5rem] xl:items-center xl:gap-8";

const VIEW_ICON: Record<AgreementView, { icon: LucideIcon; className: string }> = {
  "needs-countersign": { icon: PenLine, className: "text-state-action" },
  "waiting-counterparty": { icon: Send, className: "text-state-waiting" },
  "waiting-countersign": { icon: Hourglass, className: "text-state-waiting" },
  drafts: { icon: FilePen, className: "text-state-draft" },
  executed: { icon: CircleCheck, className: "text-state-done" },
  voided: { icon: Ban, className: "text-state-void" },
};

const HEADLINE_TONE: Record<Tone, string> = {
  action: "text-signal",
  attention: "text-alert",
  waiting: "text-paper",
  neutral: "text-paper",
  done: "text-paper",
  void: "text-slate",
};

export function QueueHeader() {
  return (
    <div aria-hidden className={`hidden border-b border-panel-border px-5 py-2.5 ${QUEUE_COLUMNS}`}>
      <span className="pl-[34px] text-xs text-slate">Agreement</span>
      <SequenceHeader />
      <span />
    </div>
  );
}

function RowAction({ action }: { action: NonNullable<QueueRow["action"]> }) {
  return (
    <Link
      href={action.href}
      className={buttonClasses("secondary", "sm", "relative z-10 border-signal/60 text-signal hover:border-signal")}
    >
      <PenLine aria-hidden />
      {action.label}
    </Link>
  );
}

export function AgreementRow({
  row,
  templateType,
  now,
}: {
  row: QueueRow;
  templateType: TemplateType;
  now: Date;
}) {
  const { agreement, view, tone, headline, detail, steps, action } = row;
  const { icon: Icon, className: iconClass } =
    tone === "attention" ? { icon: TriangleAlert, className: "text-alert" } : VIEW_ICON[view];

  return (
    <li className={`relative px-4 py-4 transition-colors hover:bg-panel/50 sm:px-5 ${QUEUE_COLUMNS}`}>
      <div className="flex min-w-0 gap-3 sm:gap-4">
        <Icon aria-hidden className={`mt-0.5 size-[18px] shrink-0 ${iconClass}`} />
        <div className="min-w-0 flex-1">
          <h3 className="text-[15px] leading-snug font-medium text-paper">
            {/* The whole row is the link; the action sits above it. */}
            <Link
              href={`/agreements/${agreement.id}`}
              className="after:absolute after:inset-0 after:rounded-sm focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-signal focus-visible:after:ring-inset"
            >
              {agreement.title}
            </Link>
          </h3>
          <p className={`mt-1 text-sm ${HEADLINE_TONE[tone]}`}>{headline}</p>
          <p className="mt-0.5 text-[13px] text-slate">
            {detail && (
              <>
                {detail.text}
                {detail.at && (
                  <>
                    {" · "}
                    {detail.atPrefix && `${detail.atPrefix} `}
                    <time dateTime={detail.at.toISOString()} title={formatDateTime(detail.at)}>
                      {formatRelative(detail.at, now)}
                    </time>
                  </>
                )}
                {" · "}
              </>
            )}
            <span className="sr-only">{TEMPLATE_TYPE_LABELS[templateType]}, </span>
            from {agreement.senderName}
          </p>

          {/* Narrower screens: the labelled sequence and the action, in the row */}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 xl:hidden">
            <div className="w-full max-w-[19rem]">
              <SequenceSteps view={view} steps={steps} labelled />
            </div>
            {action && <RowAction action={action} />}
          </div>
        </div>
      </div>

      {/* Wide screens: aligned columns under the shared header */}
      <div className="hidden xl:block">
        <SequenceSteps view={view} steps={steps} labelled={false} />
      </div>
      <div className="hidden justify-end xl:flex">{action && <RowAction action={action} />}</div>
    </li>
  );
}
