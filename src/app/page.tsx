import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { auth } from "@/auth";
import { agreementView } from "@/lib/agreement-view";
import { CountersignMark } from "@/components/CountersignMark";
import { SequenceRail } from "@/components/agreement/SequenceRail";
import { buttonClasses } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Countersign — ordered two-party signing (demo)",
  description:
    "A working demo of two-party e-signature in a fixed order: the counterparty signs first through a private link, then the company's designated signatory countersigns.",
};

// The public landing page. It reads no agreement data (a test checks this)
// and claims only what the product does; each item under "What Countersign
// enforces" is covered by the automated tests.

// A fixed, illustrative agreement — not live data — rendered with the same
// component and logic the app uses.
const EXAMPLE = agreementView(
  {
    id: "example",
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
  // Viewed by a visitor, so no step is marked "(you)".
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
    body: "Sending freezes the PDF and records its SHA-256 fingerprint. The counterparty gets a private link that works for 14 days and opens only this agreement.",
  },
  {
    title: "Counterparty signs first",
    body: "No account needed: they review the document and draw or type a signature in the browser. The signature is bound to the frozen document's fingerprint.",
  },
  {
    title: "Countersign",
    body: "Only then can the designated signatory countersign. The executed PDF is the frozen pages, unchanged, plus an execution page with both signatures — available to both sides.",
  },
];

const ENFORCED = [
  "The countersignature is refused until the counterparty has signed — by the server, and again by a database constraint.",
  "Only the signatory named on the agreement can countersign it; other signed-in users cannot.",
  "Both signatures apply to one frozen document, identified by its SHA-256 fingerprint.",
  "Signing links are random, stored only as a hash, expire, and stop working when replaced or when the agreement is voided.",
  "Voiding needs a reason and is final; an executed or voided agreement can never change state.",
  "Every step is written to an append-only history that names who acted.",
];

const NOT = [
  "No email is sent. Notifications go to an in-app demo outbox, where you can open the signing link yourself.",
  "Northlight Media Group, its people and its agreements are fictional, and the templates are not legal advice.",
  "There is one company and no identity check beyond holding the private link.",
];

export default async function LandingPage() {
  // Only reads the session cookie, to offer the right way in.
  const session = await auth();
  const signedIn = Boolean(session?.user?.id);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-panel-border">
        <div className="mx-auto flex h-14 w-full max-w-[72rem] items-center justify-between gap-4 px-4 sm:px-6 lg:px-10">
          <span className="flex items-center gap-2.5">
            <span aria-hidden>
              <CountersignMark className="size-6 text-signal" />
            </span>
            <span className="font-[family-name:var(--font-display)] text-[15px] font-semibold tracking-tight text-paper">
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
        <section className="mx-auto w-full max-w-[72rem] px-4 pt-14 pb-12 sm:px-6 lg:px-10 lg:pt-24">
          <p className="text-sm font-medium text-signal">A working e-signature demo</p>
          <h1 className="mt-3 max-w-3xl font-[family-name:var(--font-display)] text-4xl leading-[1.08] font-semibold tracking-tight text-paper sm:text-5xl lg:text-6xl">
            They sign first. Then you countersign.
          </h1>
          <p className="mt-5 max-w-2xl text-base text-slate sm:text-lg">
            Countersign handles two-party agreements in a fixed order: the counterparty signs through a private link,
            and only then can your company&rsquo;s designated signatory countersign. The order is enforced by the
            server, not just shown by the interface.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href={signedIn ? "/agreements" : "/login"} className={buttonClasses("primary")}>
              {signedIn ? "Open your agreements" : "Try the demo"}
              <ArrowRight aria-hidden />
            </Link>
            <a href="#how" className={buttonClasses("ghost")}>
              How it works
            </a>
          </div>
          {!signedIn && (
            <p className="mt-4 text-sm text-slate">Sign in with one of the published demo accounts — no sign-up.</p>
          )}
        </section>

        <section aria-labelledby="example-heading" className="border-y border-panel-border bg-ink-warm">
          <div className="mx-auto w-full max-w-[72rem] px-4 py-10 sm:px-6 lg:px-10 lg:py-14">
            <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
              <h2 id="example-heading" className="text-sm font-medium text-paper">
                The sequence, as the app shows it
              </h2>
              <p className="text-xs text-slate">Example agreement · not live data</p>
            </div>
            <p className="mt-1 text-sm text-slate">
              Petrel Logistics Co. has signed, so the countersignature is now open — to Dana Whitfield, and to no one
              else.
            </p>
            <div className="mt-8">
              <SequenceRail view={EXAMPLE} />
            </div>
          </div>
        </section>

        <section id="how" aria-labelledby="how-heading" className="mx-auto w-full max-w-[72rem] scroll-mt-6 px-4 py-14 sm:px-6 lg:px-10 lg:py-20">
          <h2 id="how-heading" className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-paper">
            How it works
          </h2>
          <ol className="mt-8 grid gap-x-10 gap-y-8 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map((step, i) => (
              <li key={step.title}>
                <p className="text-sm font-semibold text-slate tabular-nums">{i + 1}</p>
                <h3 className="mt-1 text-base font-medium text-paper">{step.title}</h3>
                <p className="mt-1.5 text-sm text-slate">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section aria-labelledby="enforced-heading" className="border-t border-panel-border">
          <div className="mx-auto grid w-full max-w-[72rem] gap-10 px-4 py-14 sm:px-6 lg:grid-cols-2 lg:gap-16 lg:px-10 lg:py-20">
            <div>
              <h2 id="enforced-heading" className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-paper">
                What Countersign enforces
              </h2>
              <ul className="mt-6 flex flex-col gap-3">
                {ENFORCED.map((item) => (
                  <li key={item} className="border-l-2 border-signal/60 pl-4 text-sm text-paper">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-paper">
                What this demo is not
              </h2>
              <ul className="mt-6 flex flex-col gap-3">
                {NOT.map((item) => (
                  <li key={item} className="border-l-2 border-panel-border-hover pl-4 text-sm text-slate">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-panel-border">
        <div className="mx-auto flex w-full max-w-[72rem] flex-wrap items-center justify-between gap-3 px-4 py-6 sm:px-6 lg:px-10">
          <p className="text-xs text-slate">Countersign is a demo. Northlight Media Group is fictional.</p>
          <Link href={signedIn ? "/agreements" : "/login"} className="inline-flex h-11 items-center text-xs text-signal hover:underline lg:h-8">
            {signedIn ? "Open the app" : "Try the demo"}
          </Link>
        </div>
      </footer>
    </div>
  );
}
