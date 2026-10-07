"use client";

import { RouteError } from "@/components/RouteError";

// Sits inside the shell layout, so the sidebar stays usable when a page's
// data fails to load.
export default function Error({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <RouteError
      error={error}
      retry={retry}
      homeHref="/documents"
      homeLabel="Documents"
    />
  );
}
