import type { Metadata } from "next";
import Link from "next/link";
import { CountersignMark } from "@/components/CountersignMark";
import { ChevronDown } from "lucide-react";
import { SampleWorkspaceButton } from "@/components/SampleWorkspaceButton";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in · Countersign" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; sample?: string }>;
}) {
  const { callbackUrl, sample } = await searchParams;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-rule bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-[72rem] items-center px-4 sm:px-6 lg:px-10">
          <Link href="/" className="flex h-11 items-center gap-2.5 rounded-md">
            <span aria-hidden>
              <CountersignMark className="size-6 text-accent" />
            </span>
            <span className="font-[family-name:var(--font-display)] text-[15px] font-semibold tracking-tight text-fg">
              Countersign
            </span>
          </Link>
        </div>
      </header>

      <main id="main" className="flex flex-1 justify-center px-4 py-12 sm:py-20">
        <div className="w-full max-w-sm">
          <h1 className="font-[family-name:var(--font-display)] text-3xl leading-tight font-semibold tracking-tight text-fg">
            Open Countersign
          </h1>
          <p className="mt-3 text-sm text-muted">
            The sample workspace opens signed in as the company&rsquo;s General Counsel, with agreements at every
            stage already loaded.
          </p>
          {sample === "unavailable" && (
            <p role="alert" className="mt-4 text-sm text-danger">
              The sample workspace is not available here. Sign in with a company account.
            </p>
          )}
          <div className="mt-6">
            <SampleWorkspaceButton size="md" className="w-full" />
          </div>

          <details className="group mt-10 border-t border-rule pt-6" open={Boolean(callbackUrl)}>
            <summary className="flex h-11 cursor-pointer list-none items-center justify-between text-sm font-medium text-fg lg:h-9 [&::-webkit-details-marker]:hidden">
              Company account sign-in
              <ChevronDown aria-hidden className="size-4 text-muted transition-transform group-open:rotate-180" />
            </summary>
            <p className="mt-1 mb-5 text-[13px] text-muted">
              People signing an agreement don&rsquo;t need an account. They use their private link.
            </p>
            <LoginForm redirectTo={callbackUrl || "/agreements"} />
          </details>
        </div>
      </main>
    </div>
  );
}
