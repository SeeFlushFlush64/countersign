"use client";

import { useActionState, useState } from "react";
import { authenticate, type LoginState } from "./actions";

// Published demo accounts (fictional people, created by the seed). The
// signatory can countersign; the paralegal can create and send but is
// refused at countersignature.
const DEMO_PASSWORD = "countersign-demo";
const DEMO_ACCOUNTS = [
  { label: "Signatory (can countersign)", email: "demo@countersign.dev" },
  { label: "Paralegal (cannot countersign)", email: "paralegal@countersign.dev" },
];

const initialState: LoginState = { error: null };

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [state, formAction, pending] = useActionState(
    authenticate,
    initialState,
  );
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="flex flex-col gap-6">
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="redirectTo" value={redirectTo} />

        <label className="flex flex-col gap-1.5">
          <span className="label-strip text-slate">Email</span>
          <input
            name="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="rounded-md border border-panel-border bg-ink px-3 py-2 text-sm text-paper placeholder:text-slate-dim focus:border-signal focus:outline-none"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="label-strip text-slate">Password</span>
          <input
            name="password"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="rounded-md border border-panel-border bg-ink px-3 py-2 text-sm text-paper placeholder:text-slate-dim focus:border-signal focus:outline-none"
          />
        </label>

        {state.error && (
          <p className="label-strip text-danger">{state.error}</p>
        )}

        <button
          type="submit"
          disabled={pending}
          className="label-strip rounded-md border border-signal bg-signal/10 px-5 py-2.5 text-paper transition-colors hover:bg-signal/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <div className="flex flex-col gap-3 rounded-md border border-panel-border bg-panel px-4 py-3">
        <p className="label-strip text-slate">
          Demo logins &middot; password {DEMO_PASSWORD}
        </p>
        {DEMO_ACCOUNTS.map((account) => (
          <div key={account.email}>
            <p className="label-strip text-slate-dim">{account.label}</p>
            <p className="font-mono text-xs text-paper">{account.email}</p>
            <button
              type="button"
              onClick={() => {
                setEmail(account.email);
                setPassword(DEMO_PASSWORD);
              }}
              className="label-strip mt-1 text-signal hover:underline"
            >
              Fill in &rarr;
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
