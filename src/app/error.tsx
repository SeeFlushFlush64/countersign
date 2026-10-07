"use client";

import { useEffect } from "react";
import Link from "next/link";
import { RotateCw, TriangleAlert } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";

// Last-resort boundary for any page or layout below the root layout — e.g.
// the signed-in frame when the database is unreachable. Shows nothing about
// the failure beyond a reference that matches the server log.
export default function RootError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-16">
      <div role="alert" className="flex max-w-md flex-col items-start gap-4">
        <TriangleAlert aria-hidden className="size-6 text-alert" />
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-xl font-semibold tracking-tight text-paper">
            Countersign could not load this page
          </h1>
          <p className="mt-2 text-sm text-slate">
            Nothing was changed. This is usually a temporary connection problem.
            {error.digest && <span className="font-mono text-xs"> Reference {error.digest}.</span>}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => retry()} className={buttonClasses("primary")}>
            <RotateCw aria-hidden />
            Try again
          </button>
          <Link href="/agreements" className={buttonClasses("ghost")}>
            Go to agreements
          </Link>
        </div>
      </div>
    </main>
  );
}
