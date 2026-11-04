import Link from "next/link";
import { PenLine } from "lucide-react";
import type { TemplateType } from "@/generated/prisma/enums";
import type { QueueRow, Tone } from "@/lib/queue";
import { TEMPLATE_TYPE_LABELS } from "@/lib/labels";
import { formatDateTime, formatRelative } from "@/lib/format";
import { buttonClasses } from "@/components/ui/button";
import { StatusChip } from "@/components/ui/StatusChip";
import { SequenceHeader, SequenceSteps } from "./SequenceSteps";

// Wide screens lay the queue out in three aligned columns, the agreement,
// its place in the signing sequence, and the one action it offers, under a
// single header row. Narrower screens stack them inside each row.
export const QUEUE_COLUMNS = "xl:grid xl:grid-cols-[minmax(0,1fr)_20rem_8.5rem] xl:items-center xl:gap-8";

const HEADLINE_TONE: Record<Tone, string> = {
  action: "text-accent",
  attention: "text-alert",
  waiting: "text-fg",
  neutral: "text-fg",
  done: "text-fg",
  void: "text-muted",
};

export function QueueHeader() {
  return (
    <div aria-hidden className={`hidden border-b border-rule px-5 py-2.5 ${QUEUE_COLUMNS}`}>
      <span className="text-xs text-muted">Agreement</span>
      <SequenceHeader />
      <span />
    </div>
  );
}

function RowAction({ action }: { action: NonNullable<QueueRow["action"]> }) {
  return (
    <Link
      href={action.href}
      className={buttonClasses("secondary", "sm", "relative z-10 border-accent/60 text-accent hover:border-accent")}
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

  return (
    <li className={`relative px-4 py-4 transition-colors hover:bg-surface/50 sm:px-5 ${QUEUE_COLUMNS}`}>
      <div className="flex min-w-0 gap-3 sm:gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <StatusChip view={view} />
          </div>
          <h3 className="mt-2 text-[15px] leading-snug font-medium text-fg">
            {/* The whole row is the link; the action sits above it. */}
            <Link
              href={`/agreements/${agreement.id}`}
              className="after:absolute after:inset-0 after:rounded-sm focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-accent focus-visible:after:ring-inset"
            >
              {agreement.title}
            </Link>
          </h3>
          <p className={`mt-1 text-sm ${HEADLINE_TONE[tone]}`}>{headline}</p>
          <p className="mt-0.5 text-[13px] text-muted">
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
