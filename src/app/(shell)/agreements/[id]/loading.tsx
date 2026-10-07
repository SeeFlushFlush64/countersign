// Placeholder with the agreement page's real layout: title, the four-step
// sequence, the next-step bar, then the document and its details.
export default function LoadingAgreement() {
  return (
    <div className="w-full max-w-[76rem] px-4 pt-5 pb-16 sm:px-6 lg:px-10 lg:pt-8" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading agreement…</span>
      <div aria-hidden className="animate-pulse">
        <div className="h-4 w-24 rounded bg-panel" />
        <div className="mt-5 h-8 w-2/3 max-w-xl rounded-md bg-panel" />
        <div className="mt-3 h-4 w-1/2 max-w-md rounded bg-panel" />
        <div className="mt-10 grid gap-6 md:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="flex gap-4 md:block">
              <div className="size-8 rounded-full bg-panel" />
              <div className="flex-1 space-y-2 md:mt-3">
                <div className="h-4 w-32 rounded bg-panel" />
                <div className="h-3.5 w-24 rounded bg-panel" />
              </div>
            </div>
          ))}
        </div>
        <div className="mt-8 h-20 border-y border-panel-border" />
        <div className="mt-8 h-[28rem] rounded-md bg-panel" />
      </div>
    </div>
  );
}
