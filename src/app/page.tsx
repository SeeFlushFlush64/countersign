import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, FileCheck2 } from "lucide-react";
import { auth } from "@/auth";
import { agreementView } from "@/lib/agreement-view";
import { CountersignMark } from "@/components/CountersignMark";
import { SampleWorkspaceButton } from "@/components/SampleWorkspaceButton";
import { SequenceRail } from "@/components/agreement/SequenceRail";
import { StatusChip } from "@/components/ui/StatusChip";
import { buttonClasses } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Countersign: ordered two-party signing",
  description:
    "Two-party agreements with a fixed signing order: the counterparty signs first through a private link, then the company's designated signatory countersigns.",
};

// The public landing page. It reads no agreement data (a test checks this)
// and claims only what the product does; each item under "What Countersign
// enforces" is covered by the automated tests.

// A fixed agreement shown in the product frame, rendered with the same
// component and logic the app uses.
const SHOWN = agreementView(
  {
    id: "shown",
    status: "PARTIALLY_SIGNED",
    createdAt: new Date("2026-03-02T09:00:00Z"),
    sentAt: new Date("2026-03-02T09:15:00Z"),
    counterpartySignedAt: new Date("2026-03-03T14:40:00Z"),
    countersignedAt: null,
    voidedAt: null,
    voidReason: null,
    voidedByName: null,
    senderId: "sender",
    senderName: "Marcus Ilori",
    countersignerId: "dana",
    countersignerName: "Dana Whitfield",
    countersignerIsSignatory: true,
    counterpartyName: "Petrel Logistics Co.",
    activeLink: null,
    executedPdf: "none",
    shareablePath: null,
  },
  // Seen by a visitor, so no step is marked "(you)".
  { id: "visitor", senderId: "visitor", isSignatory: false },
  new Date("2026-03-04T10:00:00Z"),
);

const STEPS = [
  {
    title: "Create",
    body: "Choose one of four templates, name the counterparty, and pick the company signatory who will countersign. A draft PDF is generated at once.",
  },
  {
    title: "Send",
    body: "Sending freezes the PDF and records its SHA-256 fingerprint. The counterparty's private link works for 14 days and opens only this agreement. Signing links appear in the in-app outbox, where you can open them yourself.",
  },
  {
    title: "Counterparty signs first",
    body: "No account needed. They review the document and draw or type a signature in the browser. The signature is bound to the frozen document's fingerprint.",
  },
  {
    title: "Countersign",
    body: "Only then can the designated signatory countersign. The executed PDF is the frozen pages, unchanged, plus an execution page with both signatures, available to both sides.",
  },
];

const ENFORCED = [
  "The countersignature is refused until the counterparty has signed, by the server and again by a database constraint.",
  "Only the signatory named on the agreement can countersign it. Other signed-in users cannot.",
  "Both signatures apply to one frozen document, identified by its SHA-256 fingerprint.",
  "Signing links are random, stored only as a hash, expire after 14 days, and stop working when replaced or when the agreement is voided.",
  "Voiding needs a reason and is final. An executed or voided agreement can never change state.",
  "Every step is written to an append-only history that names who acted.",
  "Whoever holds a signing link acts as the counterparty, so each link opens one agreement only.",
];

const WRAP = "mx-auto w-full max-w-[72rem] px-4 sm:px-6 lg:px-10";

export default async function LandingPage() {
  // Only reads the session cookie, to offer the right way in.
  const session = await auth();
  const signedIn = Boolean(session?.user?.id);

  return (
    <div className="flex min-h-dvh flex-col">
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
            <span className="hidden sm:block">
              <a href="#how" className={buttonClasses("ghost", "sm")}>
                How it works
              </a>
            </span>
            <Link href={signedIn ? "/agreements" : "/login"} className={buttonClasses("secondary", "sm")}>
              {signedIn ? "Open the app" : "Sign in"}
            </Link>
          </nav>
        </div>
      </header>

      <main id="main" className="flex-1">
        <section className={`${WRAP} grid items-center gap-12 pt-12 pb-16 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14 lg:pt-20 lg:pb-24`}>
          <div>
            <h1 className="font-[family-name:var(--font-display)] text-[2.6rem] leading-[1.06] font-semibold tracking-tight text-fg sm:text-6xl">
              They sign first. Then you countersign.
            </h1>
            <p className="mt-6 max-w-lg text-base text-muted sm:text-lg">
              Countersign handles two-party agreements in a fixed order. The counterparty signs through a private
              link, and only then can your company&rsquo;s designated signatory countersign. The server and the
              database enforce the order, not just the interface.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              {signedIn ? (
                <Link href="/agreements" className={buttonClasses("primary")}>
                  Open your agreements
                  <ArrowRight aria-hidden />
                </Link>
              ) : (
                <SampleWorkspaceButton />
              )}
              <a href="#how" className={buttonClasses("ghost")}>
                How it works
              </a>
            </div>
            {!signedIn && (
              <p className="mt-4 max-w-md text-sm text-muted">
                Opens signed in as the company&rsquo;s General Counsel, with sample agreements at every stage.
                No sign-up.
              </p>
            )}
          </div>

          <div className="relative">
            <div aria-hidden className="ruled absolute -inset-x-3 -top-3 -bottom-3 rounded-lg border border-rule opacity-70 sm:-inset-x-4" />
            <div className="relative rounded-lg border border-rule bg-surface p-5 shadow-sm sm:p-7">
              <div className="min-w-0">
                <StatusChip view="waiting-countersign" />
                <p className="mt-3 font-[family-name:var(--font-display)] text-xl leading-snug font-semibold text-fg">
                  Mutual NDA with Petrel Logistics Co.
                </p>
                <p className="mt-1 text-sm text-muted">Sent by Marcus Ilori, 2 March</p>
              </div>
              <div className="mt-7">
                <SequenceRail view={SHOWN} />
              </div>
              <div className="mt-7 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-rule pt-4">
                <FileCheck2 aria-hidden className="size-4 shrink-0 text-state-done" />
                <p className="text-[13px] text-muted">Frozen at send</p>
                <p className="min-w-0 truncate font-mono text-xs text-fg">SHA-256 3f9a1c07 b2e8d4a6 5c10</p>
              </div>
              <div aria-hidden className="sign-line mt-6 h-7" />
            </div>
          </div>
        </section>

        <section id="how" aria-labelledby="how-heading" className="scroll-mt-6 border-y border-rule bg-canvas-sunken">
          <div className={`${WRAP} py-14 lg:py-20`}>
            <h2 id="how-heading" className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-fg">
              How it works
            </h2>
            <ol className="mt-10 grid gap-x-10 gap-y-9 sm:grid-cols-2 lg:grid-cols-4">
              {STEPS.map((step, i) => (
                <li key={step.title}>
                  <span className="flex size-8 items-center justify-center rounded-full border border-rule-strong bg-surface text-sm font-semibold text-fg tabular-nums">
                    {i + 1}
                  </span>
                  <h3 className="mt-4 text-base font-medium text-fg">{step.title}</h3>
                  <p className="mt-1.5 text-sm text-muted">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section aria-labelledby="enforced-heading">
          <div className={`${WRAP} grid gap-10 py-14 lg:grid-cols-[minmax(0,4fr)_minmax(0,7fr)] lg:gap-16 lg:py-20`}>
            <div>
              <h2 id="enforced-heading" className="font-[family-name:var(--font-display)] text-3xl font-semibold tracking-tight text-fg">
                What Countersign enforces
              </h2>
              <p className="mt-3 max-w-sm text-sm text-muted">
                Each guarantee holds below the interface and is covered by the automated tests.
              </p>
            </div>
            <ul className="divide-y divide-rule border-y border-rule">
              {ENFORCED.map((item) => (
                <li key={item} className="flex gap-3 py-3.5 text-sm text-fg">
                  <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-state-done" strokeWidth={2.5} />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </section>
      </main>

      <footer className="border-t border-rule bg-surface">
        <div className={`${WRAP} py-6`}>
          <p className="text-xs text-muted">Sample company and agreements. Not legal advice.</p>
        </div>
      </footer>
    </div>
  );
}
