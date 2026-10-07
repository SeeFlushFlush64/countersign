import { Check } from "lucide-react";
import { formatDateTime } from "@/lib/format";

// The counterparty's view of the sequence: they sign first, the company
// countersigns, then they download the executed copy. Same visual language
// as the company's sequence rail.

export type RecipientStep = {
  title: string;
  detail: string | null;
  at?: Date | null;
  state: "done" | "current" | "ahead";
};

const SPOKEN = { done: "done", current: "now", ahead: "not yet" } as const;

export function RecipientSteps({ steps, tone = "action" }: { steps: RecipientStep[]; tone?: "action" | "waiting" }) {
  const current = tone === "action" ? "ring-2 ring-signal text-signal" : "ring-2 ring-state-waiting text-state-waiting";
  const currentText = tone === "action" ? "text-signal" : "text-state-waiting";

  return (
    <ol aria-label="How signing works" className="grid md:grid-cols-3">
      {steps.map((step, i) => (
        <li key={step.title} className="relative flex gap-4 pb-6 last:pb-0 md:block md:pr-6 md:pb-0">
          {i < steps.length - 1 && (
            <span
              aria-hidden
              className={`absolute top-10 bottom-1 left-4 w-px md:top-4 md:right-3 md:bottom-auto md:left-11 md:h-px md:w-auto ${
                step.state === "done" ? "bg-slate" : "bg-panel-border-hover"
              }`}
            />
          )}
          <span
            className={`relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold ${
              step.state === "done"
                ? "bg-paper text-ink"
                : step.state === "current"
                  ? `bg-ink ${current}`
                  : "bg-ink text-slate ring-1 ring-panel-border-hover"
            }`}
          >
            {step.state === "done" ? <Check aria-hidden className="size-4" strokeWidth={2.5} /> : i + 1}
          </span>
          <div className="min-w-0 md:mt-3">
            <p
              className={`text-[15px] leading-snug font-medium ${
                step.state === "current" ? currentText : step.state === "done" ? "text-paper" : "text-slate"
              }`}
            >
              {step.title}
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
    </ol>
  );
}
