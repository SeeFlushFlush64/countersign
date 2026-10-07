"use client";

import { useActionState } from "react";
import { LoaderCircle, RotateCw } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";

type ActionResult = { error: string | null; result: string | null };

const EMPTY: ActionResult = { error: null, result: null };

// A one-button form for a server action that reports back (retry a
// delivery, deliver queued messages). The outcome is announced politely.
export function ActionButton({
  action,
  label,
  pendingLabel,
}: {
  action: () => Promise<ActionResult>;
  label: string;
  pendingLabel: string;
}) {
  const [state, run, pending] = useActionState(async () => action(), EMPTY);
  return (
    <form action={run} className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <button type="submit" disabled={pending} className={buttonClasses("secondary", "sm")}>
        {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <RotateCw aria-hidden />}
        {pending ? pendingLabel : label}
      </button>
      <span role="status" className="text-xs">
        {state.error && <span className="text-danger">{state.error}</span>}
        {state.result && <span className="text-slate">{state.result}</span>}
      </span>
    </form>
  );
}
