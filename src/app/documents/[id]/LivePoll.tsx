"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Polls for updates while a document is waiting on a signature (sequential
// signing means the company's link unlocking is the main thing worth
// surfacing without a manual refresh). Stops entirely once fully executed
// or still in draft — nothing to wait for in either case.
export function LivePoll({ intervalMs = 5000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const id = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
