"use client";

import { useActionState } from "react";
import { LIMITS } from "@/lib/validation";
import type { VoidState } from "./actions";

export function VoidForm({
  action,
}: {
  action: (state: VoidState, formData: FormData) => Promise<VoidState>;
}) {
  const [state, formAction, pending] = useActionState(action, { error: null, voided: false });

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <label className="flex flex-col gap-1.5">
        <span className="label-strip text-slate">Void this agreement</span>
        <textarea
          name="reason"
          required
          minLength={LIMITS.voidReasonMin}
          maxLength={LIMITS.voidReason}
          rows={2}
          placeholder="Reason (recorded in the audit trail)"
          className="rounded-md border border-panel-border bg-ink px-3 py-2 text-sm text-paper placeholder:text-slate-dim focus:border-signal focus:outline-none"
        />
      </label>
      <button
        type="submit"
        disabled={pending}
        className="label-strip self-start rounded-md border border-danger/60 px-4 py-2 text-danger transition-colors hover:bg-danger/10 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {pending ? "Voiding…" : "Void agreement"}
      </button>
      <p className="text-xs text-slate-dim">
        Voiding is permanent: the signing link stops working immediately and
        the agreement can no longer be signed.
      </p>
      {state.error && <p className="label-strip text-danger">{state.error}</p>}
    </form>
  );
}
