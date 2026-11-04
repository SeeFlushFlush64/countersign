import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { CountersignMark } from "@/components/CountersignMark";
import { buttonClasses } from "@/components/ui/button";
import { ClosingCta } from "@/components/landing/ClosingCta";
import { Comparison } from "@/components/landing/Comparison";
import { Faq } from "@/components/landing/Faq";
import { Hero } from "@/components/landing/Hero";
import { Problem } from "@/components/landing/Problem";
import { Tour } from "@/components/landing/Tour";
import { Trust } from "@/components/landing/Trust";
import { UseCases } from "@/components/landing/UseCases";
import { WRAP } from "@/components/landing/layout";

export const metadata: Metadata = {
  title: "Countersign: ordered two-party signing",
  description:
    "Countersign is for agreements where order matters. The counterparty signs first, then your designated signatory, enforced by the server and the database, with a frozen, fingerprinted document and an audit trail.",
};

// The public landing page. It reads no agreement data (a test checks this)
// and claims only what the product does; each guarantee it lists is covered
// by the automated tests. Every screenshot is a capture of the application.

const NAV = [
  { href: "#tour", label: "Tour" },
  { href: "#use-cases", label: "Use cases" },
  { href: "#trust", label: "Trust" },
  { href: "#faq", label: "FAQ" },
];

export default async function LandingPage() {
  // Only reads the session cookie, to offer the right way in.
  const session = await auth();
  const signedIn = Boolean(session?.user?.id);

  return (
    <div className="flex min-h-dvh flex-col">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-accent px-4 py-2 text-sm font-medium text-canvas focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:px-4 focus:py-2.5"
      >
        Skip to content
      </a>
      <header className="border-b border-rule bg-surface">
        <div className={`${WRAP} flex h-14 items-center justify-between gap-4`}>
          <span className="flex items-center gap-2.5">
            <span aria-hidden>
              <CountersignMark className="size-6 text-accent" />
            </span>
            <span className="font-[family-name:var(--font-display)] text-[15px] font-semibold tracking-tight text-fg">
              Countersign
            </span>
          </span>
          <nav aria-label="Site" className="flex items-center gap-1">
            <span className="hidden items-center gap-1 md:flex">
              {NAV.map((item) => (
                <a key={item.href} href={item.href} className={buttonClasses("ghost", "sm")}>
                  {item.label}
                </a>
              ))}
            </span>
            <Link href={signedIn ? "/agreements" : "/login"} className={buttonClasses("secondary", "sm")}>
              {signedIn ? "Open the app" : "Sign in"}
            </Link>
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">
        <Hero signedIn={signedIn} />
        <Problem />
        <Tour />
        <UseCases />
        <Trust />
        <Comparison />
        <Faq />
        <ClosingCta signedIn={signedIn} />
      </main>

      <footer className="border-t border-rule bg-surface">
        <div className={`${WRAP} py-6`}>
          <p className="text-xs text-muted">Sample company and agreements. Not legal advice.</p>
        </div>
      </footer>
    </div>
  );
}
