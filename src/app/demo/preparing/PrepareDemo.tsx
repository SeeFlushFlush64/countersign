"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { buttonClasses } from "@/components/ui/button";
import { prepareDemoAction } from "./actions";

// Starts the reset once on arrival and continues to the agreements when it is
// done. If it fails, the visitor can carry on with the existing demo.
export function PrepareDemo() {
  const started = useRef(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    prepareDemoAction().then(
      (result) => {
        // A full page load, not the client router: the router may still hold a redirect to this page
        // that it cached for /agreements (a prefetch made while the reset was due) and would replay it.
        if (result.ok) window.location.replace("/agreements");
        else setError(result.error);
      },
      // The request itself failed (a timeout, the network): offer to go on.
      () => setError("Preparing the demo is taking longer than expected. Continue to try again."),
    );
  }, []);

  if (error) {
    return (
      <div role="alert" className="mt-6 flex flex-col items-start gap-4">
        <p className="text-sm text-slate">{error}</p>
        <Link href="/agreements" className={buttonClasses("secondary", "md")}>
          Continue to agreements
        </Link>
      </div>
    );
  }
  return (
    <p role="status" className="mt-6 flex items-center gap-2 text-sm text-slate">
      <LoaderCircle aria-hidden className="size-4 animate-spin" />
      Preparing…
    </p>
  );
}
