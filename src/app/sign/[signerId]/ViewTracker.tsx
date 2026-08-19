"use client";

import { useEffect, useRef } from "react";
import { recordViewAction } from "./actions";

// Fires only when a real browser mounts this page — never during Next.js
// Link prefetching (which fetches the RSC payload for a route without
// hydrating/mounting it), so it can't log a false "viewed" event just
// because a sender's dashboard rendered a "Sign link →" anchor.
export function ViewTracker({ signerId }: { signerId: string }) {
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current) return;
    fired.current = true;
    void recordViewAction(signerId);
  }, [signerId]);

  return null;
}
