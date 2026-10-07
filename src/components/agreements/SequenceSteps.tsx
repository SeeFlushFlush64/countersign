import type { AgreementView } from "@/lib/queue";

// The signing sequence: send → counterparty signs → company countersigns.
// Filled dot: done. Ringed dot (and emphasised label): the step the agreement
// is waiting on. Hollow dot: still ahead.
//
// The three steps sit in three equal columns, dots joined by a line. On wide
// screens the labels appear once, in the queue's header row; elsewhere each
// row labels its own steps under the dots — in the past tense once done
// ("Sent", "Counterparty signed"), so the labels read as the row's status.

export const STEP_NAMES = ["Send", "Counterparty signs", "Countersign"] as const;
const DONE_NAMES = ["Sent", "Counterparty signed", "Countersigned"] as const;

type StepState = "done" | "next" | "ahead";

const DONE_DOT: Record<AgreementView, string> = {
  "needs-countersign": "bg-state-action",
  "waiting-countersign": "bg-state-waiting",
  "waiting-counterparty": "bg-state-waiting",
  drafts: "bg-state-draft",
  executed: "bg-state-done",
  voided: "bg-state-void/70",
};

const NEXT_DOT: Partial<Record<AgreementView, string>> = {
  "needs-countersign": "ring-state-action",
  "waiting-countersign": "ring-state-waiting",
  "waiting-counterparty": "ring-state-waiting",
  drafts: "ring-state-draft",
};

const NEXT_LABEL: Partial<Record<AgreementView, string>> = {
  "needs-countersign": "text-signal",
  "waiting-countersign": "text-state-waiting",
  "waiting-counterparty": "text-state-waiting",
  drafts: "text-paper",
};

function stateOf(index: number, steps: number, view: AgreementView): StepState {
  if (index < steps) return "done";
  if (index === steps && view !== "voided" && view !== "executed") return "next";
  return "ahead";
}

const SPOKEN: Record<StepState, string> = { done: "done", next: "next", ahead: "not reached" };

const line = (done: boolean) => (done ? "bg-slate-dim" : "bg-panel-border");

export function SequenceSteps({
  view,
  steps,
  labelled,
}: {
  view: AgreementView;
  steps: 0 | 1 | 2 | 3;
  // Show each step's label under its dot (rows without the shared header).
  labelled: boolean;
}) {
  return (
    <ol aria-label="Signing sequence" className="grid grid-cols-3">
      {STEP_NAMES.map((name, i) => {
        const state = stateOf(i, steps, view);
        const label = state === "done" ? DONE_NAMES[i] : name;
        return (
          <li key={name} className="flex flex-col items-center gap-1.5">
            <div className="relative flex h-2.5 w-full items-center justify-center">
              {i > 0 && <span aria-hidden className={`absolute right-1/2 left-0 h-px ${line(i < steps)}`} />}
              {i < STEP_NAMES.length - 1 && (
                <span aria-hidden className={`absolute right-0 left-1/2 h-px ${line(i + 1 < steps)}`} />
              )}
              <span
                aria-hidden
                className={`relative block size-2.5 rounded-full ${
                  state === "done"
                    ? DONE_DOT[view]
                    : state === "next"
                      ? `bg-ink ring-[1.5px] ring-inset ${NEXT_DOT[view] ?? "ring-slate-dim"}`
                      : "bg-ink ring-1 ring-inset ring-slate-dim"
                }`}
              />
            </div>
            <span
              className={
                labelled
                  ? `px-1 text-center text-xs leading-tight ${
                      state === "next" ? `font-medium ${NEXT_LABEL[view] ?? "text-paper"}` : "text-slate"
                    }`
                  : "sr-only"
              }
            >
              {label}
              <span className="sr-only">: {SPOKEN[state]}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// Step names for the shared header, aligned with the three columns.
export function SequenceHeader() {
  return (
    <div aria-hidden className="grid grid-cols-3 text-center text-xs text-slate">
      {STEP_NAMES.map((name) => (
        <span key={name}>{name}</span>
      ))}
    </div>
  );
}
