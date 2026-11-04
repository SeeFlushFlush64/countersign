"use client";

import { useEffect, useRef, useState } from "react";
import { Check, FileCheck2, Lock } from "lucide-react";

// The signing order as a timeline that plays once when it scrolls into view:
// the document is sent, a countersignature is tried too early and refused,
// the counterparty signs, then the signatory countersigns and the agreement
// is executed. Server-rendered and with reduced motion it shows the finished
// order straight away; nothing here is needed to read the page.

type Step = { title: string; detail: string };

const STEPS: Step[] = [
  { title: "Sent and frozen", detail: "The PDF is fixed and its SHA-256 fingerprint is recorded." },
  { title: "Counterparty signs first", detail: "Through a private link, on the frozen document." },
  { title: "Signatory countersigns", detail: "Only the person named on the agreement, and only after the counterparty." },
  { title: "Executed", detail: "The frozen pages plus an execution page with both signatures." },
];

const FINAL_PHASE = 5;
// Phase 1: sent. 2: an early countersignature is refused. 3: counterparty signed.
// 4: countersigned. 5: executed.
const STEP_DONE_AT = [1, 3, 4, 5];
const STEP_MS = 800;

export function OrderTimeline() {
  const ref = useRef<HTMLOListElement>(null);
  const [phase, setPhase] = useState(FINAL_PHASE);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !("IntersectionObserver" in window)) return;

    const timers: number[] = [];
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        observer.disconnect();
        for (let p = 1; p <= FINAL_PHASE; p++) timers.push(window.setTimeout(() => setPhase(p), p * STEP_MS));
      },
      { threshold: 0.5 },
    );
    // Start from the empty order only once the browser can play it.
    timers.push(window.setTimeout(() => setPhase(0), 0));
    observer.observe(el);
    return () => {
      observer.disconnect();
      timers.forEach((t) => window.clearTimeout(t));
    };
  }, []);

  return (
    <ol ref={ref} className="flex flex-col">
      {STEPS.map((step, i) => {
        const done = phase >= STEP_DONE_AT[i];
        const refused = i === 2 && phase === 2;
        const last = i === STEPS.length - 1;
        const connectorFilled = !last && phase >= STEP_DONE_AT[i + 1];
        return (
          <li key={step.title} className="relative pb-9 pl-14 last:pb-0">
            {!last && (
              <span aria-hidden className="absolute top-9 bottom-1 left-[15px] w-px bg-rule-strong">
                <span
                  className={`block h-full w-px origin-top bg-accent transition-transform duration-700 ease-out ${
                    connectorFilled ? "scale-y-100" : "scale-y-0"
                  }`}
                />
              </span>
            )}
            <span
              aria-hidden
              className={`absolute top-0 left-0 flex size-8 items-center justify-center rounded-full border-2 text-sm font-semibold transition-colors duration-500 ${
                refused
                  ? "border-gold-fill bg-gold-soft text-gold"
                  : done
                    ? last
                      ? "border-state-done bg-state-done text-canvas"
                      : "border-accent bg-accent text-canvas"
                    : "border-rule-strong bg-surface text-muted"
              }`}
            >
              {refused ? <Lock className="size-4" /> : done ? last ? <FileCheck2 className="size-4" /> : <Check className="size-4" strokeWidth={2.75} /> : i + 1}
            </span>
            <p className="text-base font-medium text-fg">{step.title}</p>
            <p className="mt-0.5 text-sm text-muted">{step.detail}</p>
            {refused && (
              // Decorative, and only present for the moment it plays. It sits in
              // the step's bottom spacing, so nothing below it moves.
              <p
                aria-hidden
                className="absolute bottom-1 left-14 inline-flex items-center gap-2 rounded-full border border-gold-fill/50 bg-gold-soft px-3 py-1 text-xs font-medium text-gold"
              >
                <Lock className="size-3.5" />
                Refused: the counterparty has not signed yet
              </p>
            )}
          </li>
        );
      })}
    </ol>
  );
}
