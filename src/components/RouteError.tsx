"use client";

import Link from "next/link";
import { useEffect } from "react";
import { StatusStrip } from "@/components/StatusStrip";

// Shared fallback for the app's error.tsx boundaries. In production, server
// errors reach the client only as a generic message plus a digest, so this
// never tries to explain the cause — it offers a retry and the digest to
// match against the server log.
export function RouteError({
  error,
  retry,
  homeHref,
  homeLabel,
}: {
  error: Error & { digest?: string };
  retry: () => void;
  homeHref: string;
  homeLabel: string;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-16">
      <StatusStrip segments={["COUNTERSIGN", "ERROR"]} />
      <h1 className="mt-4 font-[family-name:var(--font-display)] text-2xl font-semibold text-paper">
        This page couldn&rsquo;t load
      </h1>
      <p className="mt-2 text-sm text-slate">
        Something went wrong while loading this page, often a temporary problem
        reaching the database. Nothing was changed. Try again in a moment.
      </p>
      {error.digest && (
        <p className="mt-3 font-mono text-xs text-slate-dim">
          Reference {error.digest}
        </p>
      )}
      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={() => retry()}
          className="label-strip rounded-md border border-signal bg-signal/10 px-5 py-2.5 text-paper transition-colors hover:bg-signal/20"
        >
          Try again
        </button>
        <Link
          href={homeHref}
          className="label-strip rounded-md border border-panel-border px-4 py-2.5 text-slate transition-colors hover:border-panel-border-hover hover:text-paper"
        >
          {homeLabel}
        </Link>
      </div>
    </div>
  );
}
