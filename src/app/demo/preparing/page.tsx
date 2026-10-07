import type { Metadata } from "next";
import { CountersignMark } from "@/components/CountersignMark";
import { requireUser } from "@/lib/session";
import { PrepareDemo } from "./PrepareDemo";

export const metadata: Metadata = { title: "Preparing the demo · Countersign" };

// Seeding a fresh demo renders its agreements' PDFs, which takes a while.
export const maxDuration = 120;

// Where the app sends a visitor when the shared demo was used and then left
// idle: a fresh copy is seeded (a new epoch; nothing is deleted) before they
// see it.
export default async function PreparingDemoPage() {
  await requireUser();
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-panel-border">
        <div className="mx-auto flex h-14 w-full max-w-[72rem] items-center gap-2.5 px-4 sm:px-6 lg:px-10">
          <span aria-hidden>
            <CountersignMark className="size-6 text-signal" />
          </span>
          <span className="font-[family-name:var(--font-display)] text-[15px] font-semibold tracking-tight text-paper">
            Countersign
          </span>
        </div>
      </header>
      <main id="main" className="flex flex-1 justify-center px-4 py-12 sm:py-20">
        <div className="w-full max-w-md">
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-paper">
            Preparing a fresh demo
          </h1>
          <p className="mt-2 text-sm text-slate">
            The shared demo starts fresh after a period of inactivity, so its example agreements are being set up
            again. This takes up to half a minute. Earlier sessions are kept, not deleted, but no longer appear.
          </p>
          <PrepareDemo />
        </div>
      </main>
    </div>
  );
}
