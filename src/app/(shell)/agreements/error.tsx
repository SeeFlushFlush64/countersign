"use client";

import { useEffect } from "react";
import { RotateCw, TriangleAlert } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";

// The queue failed to load (e.g. the database is unreachable). Nothing has
// changed; trying again re-renders the page.
export default function AgreementsError({
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
    <div className="w-full max-w-[76rem] px-4 pt-6 pb-16 sm:px-6 lg:px-10 lg:pt-10">
      <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-paper">
        Agreements
      </h1>
      <div role="alert" className="mt-6 flex flex-col items-start gap-3 border-y border-panel-border py-10">
        <TriangleAlert aria-hidden className="size-5 text-alert" />
        <div>
          <p className="text-[15px] font-medium text-paper">Agreements could not be loaded</p>
          <p className="mt-1 max-w-md text-sm text-slate">
            Nothing was changed. This is usually a temporary connection problem.
            {error.digest && <span className="font-mono text-xs"> Reference {error.digest}.</span>}
          </p>
        </div>
        <button type="button" onClick={() => retry()} className={buttonClasses("secondary", "sm")}>
          <RotateCw aria-hidden />
          Try again
        </button>
      </div>
    </div>
  );
}
