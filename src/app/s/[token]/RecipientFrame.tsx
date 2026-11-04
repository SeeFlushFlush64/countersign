import { Lock } from "lucide-react";
import { CountersignMark } from "@/components/CountersignMark";

// The page frame for people outside the company: no app navigation, no
// account, just who is behind the page and that the link is private.
export function RecipientFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-rule">
        <div className="mx-auto flex h-14 w-full max-w-[72rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
          <span className="flex items-center gap-2.5">
            <span aria-hidden>
              <CountersignMark className="size-6 text-accent" />
            </span>
            <span className="font-[family-name:var(--font-display)] text-[15px] font-semibold tracking-tight text-fg">
              Countersign
            </span>
          </span>
          <span className="flex items-center gap-1.5 text-xs text-muted">
            <Lock aria-hidden className="size-3.5" />
            Private signing link
          </span>
        </div>
      </header>
      <main id="main" className="mx-auto w-full max-w-[72rem] flex-1 px-4 pt-6 pb-28 sm:px-6 md:pb-16 lg:px-10 lg:pt-10">
        {children}
      </main>
      <footer className="border-t border-rule">
        <p className="mx-auto w-full max-w-[72rem] px-4 py-5 text-xs text-muted sm:px-6 lg:px-10">
          Sample company and agreements. Not legal advice.
        </p>
      </footer>
    </div>
  );
}

// A link that cannot be used (unknown, replaced, voided, expired): what
// happened and what to do, with nothing about the agreement itself.
export function LinkProblem({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex max-w-lg flex-col items-start gap-3 py-10 md:py-16">
      <span className="text-muted">{icon}</span>
      <h1 className="font-[family-name:var(--font-display)] text-2xl leading-tight font-semibold tracking-tight text-fg">
        {title}
      </h1>
      <div className="flex flex-col gap-2 text-[15px] text-muted">{children}</div>
    </div>
  );
}
