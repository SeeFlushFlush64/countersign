"use client";

import { useActionState, useState } from "react";
import { authenticate, type LoginState } from "./actions";

const DEMO_EMAIL = "demo@countersign.dev";
const DEMO_PASSWORD = "countersign-demo";

const initialState: LoginState = { error: null };

export function LoginForm({
  redirectTo,
  prefillDemo = false,
}: {
  redirectTo: string;
  prefillDemo?: boolean;
}) {
  const [state, formAction, pending] = useActionState(
    authenticate,
    initialState,
  );
  // "Try the demo" on the marketing homepage links here with ?demo=1 so
  // the credentials are ready and the visitor only has to click "Sign in".
  // prefillDemo comes from a server-rendered search param and won't change
  // for the life of this component, so a lazy initial value is enough —
  // no effect needed.
  const [email, setEmail] = useState(prefillDemo ? DEMO_EMAIL : "");
  const [password, setPassword] = useState(prefillDemo ? DEMO_PASSWORD : "");

  const fillDemoCredentials = () => {
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
  };

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

      <div className="rounded-md border border-panel-border bg-panel px-4 py-3">
        <p className="label-strip text-slate">Demo login</p>
        <p className="mt-1.5 font-mono text-xs text-paper">{DEMO_EMAIL}</p>
        <p className="font-mono text-xs text-paper">{DEMO_PASSWORD}</p>
        <button
          type="button"
          onClick={fillDemoCredentials}
          className="label-strip mt-3 text-signal hover:underline"
        >
          Fill in demo credentials &rarr;
        </button>
      </div>
    </div>
  );
}
