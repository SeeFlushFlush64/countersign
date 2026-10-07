"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// While an agreement waits on someone, re-fetch it periodically so a
// signature made elsewhere shows up without a manual reload. Skips refreshes
// while the tab is hidden. Rendered only for agreements that are waiting.
export function LivePoll({ intervalMs = 10_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
