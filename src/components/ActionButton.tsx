"use client";

import { useActionState } from "react";

type ActionResult = { error: string | null; result: string | null };

const EMPTY: ActionResult = { error: null, result: null };

// A one-button form for a server action that reports back (retry a
// delivery, deliver queued messages).
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
    <form action={run} className="flex flex-wrap items-center gap-2">
      <button
        type="submit"
        disabled={pending}
        className="label-strip rounded-md border border-panel-border px-2.5 py-1 text-paper transition-colors hover:border-signal disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? pendingLabel : label}
      </button>
      {state.error && <span className="text-xs text-danger">{state.error}</span>}
      {state.result && <span className="text-xs text-slate">{state.result}</span>}
    </form>
  );
}
