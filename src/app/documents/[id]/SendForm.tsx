"use client";

import { useActionState } from "react";
import type { SendState } from "./actions";

export function SendForm({
  action,
  note,
}: {
  action: (state: SendState) => Promise<SendState>;
  note: string;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null });

  return (
    <form action={formAction}>
      <button
        type="submit"
        disabled={pending}
        className="label-strip w-full rounded-md border border-signal bg-signal/10 px-4 py-3 text-paper transition-colors hover:bg-signal/20 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Freezing PDF…" : "Send for signature"}
      </button>
      <p className="mt-2 text-xs text-slate-dim">{note}</p>
      {state.error && <p className="label-strip mt-2 text-danger">{state.error}</p>}
    </form>
  );
}
