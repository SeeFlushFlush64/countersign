"use client";

import { useActionState } from "react";
import { LoaderCircle, LogIn } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { authenticate, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

const INPUT =
  "h-11 rounded-md border border-rule bg-surface px-3 text-base text-fg placeholder:text-muted focus:border-accent focus:outline-none lg:h-10 lg:text-sm";

// Email and password sign-in for company accounts. The sample workspace has
// its own one-click entry and no published password.
export function LoginForm({ redirectTo }: { redirectTo: string }) {
  const [state, formAction, pending] = useActionState(authenticate, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="redirectTo" value={redirectTo} />
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-fg">Email</span>
        <input name="email" type="email" autoComplete="username" required className={INPUT} />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-medium text-fg">Password</span>
        <input name="password" type="password" autoComplete="current-password" required className={INPUT} />
      </label>

      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}

      <button type="submit" disabled={pending} className={buttonClasses("secondary", "md", "mt-1 w-full")}>
        {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : <LogIn aria-hidden />}
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
