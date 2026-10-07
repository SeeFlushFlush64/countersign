// Instant fallback for loading.tsx while a page's database reads resolve.
export function PageLoading({ label = "Loading" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-1 items-center justify-center px-6 py-24"
    >
      <span className="label-strip inline-flex items-center gap-2 text-slate">
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-signal motion-reduce:animate-none" />
        {label}&hellip;
      </span>
    </div>
  );
}
