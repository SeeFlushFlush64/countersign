import type { Metadata } from "next";
import Link from "next/link";
import { CountersignMark } from "@/components/CountersignMark";
import { LoginForm } from "./LoginForm";

export const metadata: Metadata = { title: "Sign in · Countersign" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string }>;
}) {
  const { callbackUrl } = await searchParams;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-panel-border">
        <div className="mx-auto flex h-14 w-full max-w-[72rem] items-center px-4 sm:px-6 lg:px-10">
          <Link href="/" className="flex h-11 items-center gap-2.5 rounded-md">
            <span aria-hidden>
              <CountersignMark className="size-6 text-signal" />
            </span>
            <span className="font-[family-name:var(--font-display)] text-[15px] font-semibold tracking-tight text-paper">
              Countersign
            </span>
          </Link>
        </div>
      </header>

      <main id="main" className="flex flex-1 justify-center px-4 py-12 sm:py-20">
        <div className="w-full max-w-sm">
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-paper">
            Sign in
          </h1>
          <p className="mt-2 text-sm text-slate">
            For company users. People signing an agreement don&rsquo;t need an account — they use their private
            link.
          </p>
          <div className="mt-8">
            <LoginForm redirectTo={callbackUrl || "/agreements"} />
          </div>
        </div>
      </main>
    </div>
  );
}
