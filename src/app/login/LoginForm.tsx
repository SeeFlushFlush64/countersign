"use client";

import { useActionState } from "react";
import { LoaderCircle, LogIn } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { authenticate, type LoginState } from "./actions";

// Published demo accounts (fictional people, created by the seed). The
// signatory can countersign; the paralegal can create and send but is
// refused at countersignature.
const DEMO_PASSWORD = "countersign-demo";
const DEMO_ACCOUNTS = [
  {
    email: "demo@countersign.dev",
    name: "Dana Whitfield",
    role: "General Counsel — can countersign",
  },
  {
    email: "paralegal@countersign.dev",
    name: "Tomás Reyes",
    role: "Paralegal — creates and sends, can’t countersign",
  },
];

const initialState: LoginState = { error: null };

const INPUT =
  "h-11 rounded-md border border-panel-border bg-ink px-3 text-base text-paper placeholder:text-slate focus:border-signal focus:outline-none lg:h-10 lg:text-sm";

export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [state, formAction, pending] = useActionState(authenticate, initialState);

  return (
    <div className="flex flex-col gap-8">
      <form action={formAction} className="flex flex-col gap-4">
        <input type="hidden" name="redirectTo" value={redirectTo} />
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-paper">Email</span>
          <input name="email" type="email" autoComplete="username" required className={INPUT} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-paper">Password</span>
          <input name="password" type="password" autoComplete="current-password" required className={INPUT} />
        </label>

        {state.error && (
          <p role="alert" className="text-sm text-danger">
            {state.error}
          </p>
        )}

        <button type="submit" disabled={pending} className={buttonClasses("primary", "md", "mt-1 w-full")}>
          {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <LogIn aria-hidden />}
          {pending ? "Signing in…" : "Sign in"}
        </button>
      </form>

      <section aria-labelledby="demo-heading" className="border-t border-panel-border pt-6">
        <h2 id="demo-heading" className="text-sm font-medium text-paper">
          Demo accounts
        </h2>
        <p className="mt-0.5 text-[13px] text-slate">
          Fictional people. Password for both: <span className="font-mono text-paper">{DEMO_PASSWORD}</span>
        </p>
        <ul className="mt-3 flex flex-col gap-2">
          {DEMO_ACCOUNTS.map((account) => (
            <li key={account.email}>
              <form action={formAction}>
                <input type="hidden" name="redirectTo" value={redirectTo} />
                <input type="hidden" name="email" value={account.email} />
                <input type="hidden" name="password" value={DEMO_PASSWORD} />
                <button
                  type="submit"
                  disabled={pending}
                  className="flex min-h-14 w-full items-center gap-3 rounded-md border border-panel-border px-4 py-2.5 text-left transition-colors hover:border-panel-border-hover hover:bg-panel disabled:opacity-50"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-paper">Continue as {account.name}</span>
                    <span className="block text-xs text-slate">{account.role}</span>
                  </span>
                </button>
              </form>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
