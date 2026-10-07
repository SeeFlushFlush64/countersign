import { Ban, Check, FileCheck2 } from "lucide-react";
import type { AgreementView, RailStep } from "@/lib/agreement-view";
import { formatDateTime } from "@/lib/format";

// The agreement's signing sequence, as the page's central element:
//   1 the sender sends → 2 the counterparty signs first →
//   3 the designated signatory countersigns → the agreement is executed.
// Horizontal from md up, vertical on phones. Every step names its person,
// what they did or are expected to do, and when.

type Tone = AgreementView["tone"];

const CURRENT_RING: Record<Tone, string> = {
  action: "ring-2 ring-signal text-signal",
  waiting: "ring-2 ring-state-waiting text-state-waiting",
  attention: "ring-2 ring-alert text-alert",
  neutral: "ring-2 ring-slate text-paper",
  done: "ring-2 ring-slate text-paper",
  void: "ring-2 ring-slate text-paper",
};

const CURRENT_TEXT: Record<Tone, string> = {
  action: "text-signal",
  waiting: "text-state-waiting",
  attention: "text-alert",
  neutral: "text-paper",
  done: "text-paper",
  void: "text-paper",
};

const SPOKEN = {
  done: "done",
  current: "in progress",
  ahead: "not reached",
  stopped: "stopped by the void",
} as const;

function Marker({ step, index, tone }: { step: RailStep; index: number; tone: Tone }) {
  const base = "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold";
  switch (step.state) {
    case "done":
      return (
        <span className={`${base} bg-paper text-ink`}>
          <Check aria-hidden className="size-4" strokeWidth={2.5} />
        </span>
      );
    case "current":
      return <span className={`${base} bg-ink ${CURRENT_RING[tone]}`}>{index + 1}</span>;
    case "stopped":
      return (
        <span className={`${base} bg-ink text-state-void ring-1 ring-state-void`}>
          <Ban aria-hidden className="size-4" />
        </span>
      );
    case "ahead":
      return <span className={`${base} bg-ink text-slate ring-1 ring-panel-border-hover`}>{index + 1}</span>;
  }
}

// Line from this step to the next: solid once this step is done.
function Connector({ done }: { done: boolean }) {
  return (
    <span
      aria-hidden
      className={`absolute top-10 bottom-1 left-4 w-px md:top-4 md:right-3 md:bottom-auto md:left-11 md:h-px md:w-auto ${
        done ? "bg-slate" : "bg-panel-border-hover"
      }`}
    />
  );
}

export function SequenceRail({ view }: { view: AgreementView }) {
  const { steps, outcome, tone } = view;

  return (
    <ol aria-label="Signing sequence" className="grid gap-0 md:grid-cols-4">
      {steps.map((step, i) => (
        <li key={step.key} className="relative flex gap-4 pb-7 md:block md:pr-6 md:pb-0">
          <Connector done={step.state === "done"} />
          <Marker step={step} index={i} tone={tone} />
          <div className="min-w-0 md:mt-3">
            <p className="text-[15px] leading-snug font-medium text-paper">{step.actor}</p>
            <p className={`mt-0.5 text-sm ${step.state === "current" ? `font-medium ${CURRENT_TEXT[tone]}` : step.state === "stopped" ? "text-state-void" : "text-slate"}`}>
              {step.state === "stopped" ? `${step.title} — stopped` : step.title}
              <span className="sr-only">, step {i + 1}, {SPOKEN[step.state]}</span>
            </p>
            {step.at && (
              <p className="mt-0.5 text-[13px] text-slate">
                <time dateTime={step.at.toISOString()}>{formatDateTime(step.at)}</time>
              </p>
            )}
            {step.detail && <p className="mt-0.5 text-[13px] text-slate">{step.detail}</p>}
          </div>
        </li>
      ))}

      {/* The outcome the sequence leads to */}
      <li className="relative flex gap-4 md:block">
        {outcome.kind === "executed" ? (
          <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-state-done text-ink">
            <FileCheck2 aria-hidden className="size-4" />
          </span>
        ) : outcome.kind === "voided" ? (
          <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-state-void ring-1 ring-state-void">
            <Ban aria-hidden className="size-4" />
          </span>
        ) : (
          <span className="relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full bg-ink text-slate ring-1 ring-panel-border-hover">
            <FileCheck2 aria-hidden className="size-4" />
          </span>
        )}
        <div className="min-w-0 md:mt-3">
          {outcome.kind === "executed" ? (
            <>
              <p className="text-[15px] leading-snug font-medium text-state-done">Executed</p>
              <p className="mt-0.5 text-[13px] text-slate">
                <time dateTime={outcome.at.toISOString()}>{formatDateTime(outcome.at)}</time>
              </p>
            </>
          ) : outcome.kind === "voided" ? (
            <>
              <p className="text-[15px] leading-snug font-medium text-state-void">Voided</p>
              <p className="mt-0.5 text-[13px] text-slate">
                by {outcome.by} · <time dateTime={outcome.at.toISOString()}>{formatDateTime(outcome.at)}</time>
              </p>
            </>
          ) : (
            <>
              <p className="text-[15px] leading-snug font-medium text-slate">Executed</p>
              <p className="mt-0.5 text-[13px] text-slate">When both have signed, in this order</p>
            </>
          )}
        </div>
      </li>
    </ol>
  );
}
