// Placeholder with the queue's real layout, so nothing jumps when it loads.
export default function LoadingAgreements() {
  return (
    <div
      className="w-full max-w-[76rem] px-4 pt-6 pb-16 sm:px-6 lg:px-10 lg:pt-10"
      aria-busy="true"
      aria-live="polite"
    >
      <span className="sr-only">Loading agreements…</span>
      <div aria-hidden className="animate-pulse">
        <div className="flex items-start justify-between gap-6">
          <div>
            <div className="h-7 w-40 rounded-md bg-panel" />
            <div className="mt-2 h-4 w-64 max-w-full rounded bg-panel" />
          </div>
          <div className="h-11 w-36 rounded-md bg-panel lg:h-10" />
        </div>
        <div className="mt-6 flex gap-6 border-b border-panel-border pb-3">
          {[28, 36, 32, 16, 20].map((w, i) => (
            <div key={i} className="h-4 rounded bg-panel" style={{ width: `${w * 4}px` }} />
          ))}
        </div>
        <div className="divide-y divide-panel-border">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="flex gap-4 px-4 py-4 sm:px-5">
              <div className="size-[18px] rounded-full bg-panel" />
              <div className="flex-1 space-y-2">
                <div className="h-4 w-2/3 rounded bg-panel" />
                <div className="h-3.5 w-1/2 rounded bg-panel" />
                <div className="h-3 w-1/3 rounded bg-panel" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
