import Link from "next/link";
import Image from "next/image";
import {
  FileText,
  Send,
  CircleCheck,
  Workflow,
  type LucideIcon,
} from "lucide-react";
import { siGoogledrive, siDropbox, siZapier } from "simple-icons";
import { prisma } from "@/lib/prisma";
import howItWorksScreenshot from "@/assets/how-it-works-screenshot.png";
import howItWorksScreenshotMobile from "@/assets/how-it-works-screenshot-mobile.png";
import { ActivityFeed, type ActivityRow } from "@/components/ActivityFeed";
import { Reveal } from "@/components/Reveal";
import { CountersignMark } from "@/components/CountersignMark";

export const dynamic = "force-dynamic";

// Shown only if the database has no StatusEvents yet (e.g. a fresh,
// unseeded environment) — same fictional companies/people as
// prisma/seed.ts, so the panel never looks broken or like a mockup.
const FALLBACK_ACTIVITY: ActivityRow[] = [
  {
    id: "fallback-1",
    eventType: "SIGNED",
    actor: "Ashgrove Creative LLC",
    documentTitle: "Mutual NDA — Ashgrove Creative LLC",
    timestamp: new Date(Date.now() - 4 * 60 * 1000),
  },
  {
    id: "fallback-2",
    eventType: "VIEWED",
    actor: "Petrel Logistics Co.",
    documentTitle: "Vendor Services Agreement — Petrel Logistics Co.",
    timestamp: new Date(Date.now() - 26 * 60 * 1000),
  },
  {
    id: "fallback-3",
    eventType: "SENT",
    actor: "Priya Anand",
    documentTitle: "Media Release — Jordan Vance",
    timestamp: new Date(Date.now() - 55 * 60 * 1000),
  },
  {
    id: "fallback-4",
    eventType: "FULLY_EXECUTED",
    actor: "Countersign",
    documentTitle: "Mutual NDA — Blackwood Studio Rentals",
    timestamp: new Date(Date.now() - 3 * 60 * 60 * 1000),
  },
  {
    id: "fallback-5",
    eventType: "CREATED",
    actor: "Tomás Reyes",
    documentTitle: "Content Licensing Order — Fenwick Sound Library",
    timestamp: new Date(Date.now() - 5 * 60 * 60 * 1000),
  },
];

// The public homepage must not depend on the database being reachable:
// if the query fails, the page renders without the activity panel rather
// than failing as a whole (and never substitutes sample rows for an outage).
async function getActivity(): Promise<ActivityRow[] | null> {
  let events;
  try {
    events = await prisma.statusEvent.findMany({
      orderBy: { timestamp: "desc" },
      take: 6,
      include: { document: { select: { title: true } } },
    });
  } catch (error) {
    console.error("Landing activity query failed:", error);
    return null;
  }

  if (events.length === 0) return FALLBACK_ACTIVITY;

  return events.map((event) => ({
    id: event.id,
    eventType: event.eventType,
    actor: event.actor,
    documentTitle: event.document.title,
    timestamp: event.timestamp,
  }));
}

// Framed architecturally (what's different under the hood), not as
// head-to-head marketing claims against any named competitor.
const DIFFERENTIATOR_ROWS = [
  {
    aspect: "Signing order",
    typical: "UI suggestion, rarely enforced",
    countersign:
      "Enforced server-side — the company literally cannot sign before the counterparty",
  },
  {
    aspect: "Audit trail",
    typical: "Scoped per document",
    countersign: "One global feed across every document, in real time",
  },
  {
    aspect: "Signer access",
    typical: "Account or magic-link required",
    countersign: "Just a URL, no account needed",
  },
  {
    aspect: "Document proof",
    typical: "Static PDF generated once",
    countersign: "Regenerated live at every state change",
  },
];

// Descriptions pulled from each template's distinct terms in
// src/lib/pdf/content.ts, not generic marketing copy.
const TEMPLATE_SHOWCASE = [
  {
    name: "Mutual NDA",
    description: "Mutual confidentiality, 3-year term, no license granted",
  },
  {
    name: "Vendor Services Agreement",
    description:
      "Independent contractor terms, work-for-hire deliverables, 30-day termination",
  },
  {
    name: "Media Release & Consent",
    description:
      "Irrevocable usage grant, no compensation required, revocable pre-publication",
  },
  {
    name: "Content Licensing Order",
    description: "Non-exclusive license, 12-month term, attribution required",
  },
];

// GoHighLevel has no entry in simple-icons, so it falls back to a
// generic lucide glyph plus its name rather than a fabricated logo.
const INTEGRATIONS: (
  | { name: string; kind: "brand"; path: string }
  | { name: string; kind: "lucide"; icon: LucideIcon }
)[] = [
  { name: "Google Drive", kind: "brand", path: siGoogledrive.path },
  { name: "Dropbox", kind: "brand", path: siDropbox.path },
  { name: "Zapier", kind: "brand", path: siZapier.path },
  { name: "GoHighLevel", kind: "lucide", icon: Workflow },
];

export default async function LandingPage() {
  const activity = await getActivity();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-panel-border">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-5">
          <div className="flex items-center gap-2">
            <CountersignMark className="h-6 w-6 text-signal" />
            <span className="font-mono text-sm lowercase tracking-tight text-paper">
              countersign
            </span>
          </div>
          <nav className="flex items-center gap-3">
            <Link
              href="/login"
              className="label-strip text-slate transition-colors hover:text-paper"
            >
              Login
            </Link>
            <Link
              href="/login?demo=1"
              className="label-strip rounded-md border border-signal bg-signal/10 px-4 py-2 text-paper transition-colors hover:bg-signal/20"
            >
              Try the demo
            </Link>
          </nav>
        </div>
      </header>

      <main className="flex-1">
        <section className="mx-auto w-full max-w-5xl px-6 pt-20 pb-16">
          <p className="label-strip text-slate">Countersign</p>
          <h1 className="mt-4 max-w-2xl font-[family-name:var(--font-display)] text-5xl leading-[1.05] font-semibold tracking-tight text-paper sm:text-6xl">
            They sign first.
            <br />
            You countersign second.
          </h1>
          <p className="mt-6 max-w-md text-lg text-slate">
            A document signed out of order isn&rsquo;t sloppy paperwork
            &mdash; it can be the difference between enforceable and
            worthless.
          </p>
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Link
              href="/login?demo=1"
              className="label-strip rounded-md bg-signal px-5 py-3 text-ink transition-colors hover:bg-signal/90"
            >
              Try the live demo
            </Link>
            <a
              href="#how-it-works"
              className="label-strip rounded-md border border-panel-border px-5 py-3 text-paper transition-colors hover:border-panel-border-hover"
            >
              See how it works
            </a>
          </div>
        </section>

        {activity && (
          <section className="mx-auto w-full max-w-5xl px-6 pb-24">
            <ActivityFeed activity={activity} />
          </section>
        )}

        <Reveal id="how-it-works" className="mx-auto w-full max-w-5xl px-6 pb-24">
          <p className="label-strip text-slate">How it works</p>
          <div className="mt-6 grid gap-10 lg:grid-cols-[1fr_1.7fr] lg:items-start">
            <div className="grid gap-10 sm:grid-cols-3 lg:grid-cols-1">
              <Step number="01" icon={FileText} title="Create">
                Pick a template, enter who you&rsquo;re dealing with. A
                real, ready-to-send PDF exists in seconds &mdash; not a
                mockup.
              </Step>
              <Step number="02" icon={Send} title="Send">
                They sign first &mdash; no account, no password, just a
                link to their signing room.
              </Step>
              <Step number="03" icon={CircleCheck} title="Countersign">
                Only once they&rsquo;ve signed can you countersign &mdash;
                enforced by the server, not a UI convention. The moment
                both signatures land, the document executes itself.
              </Step>
            </div>

            <div className="overflow-hidden rounded-lg border border-panel-border bg-panel">
              <div className="flex items-center gap-1.5 border-b border-panel-border px-3 py-2.5">
                <span className="h-2 w-2 rounded-full bg-slate-dim" />
                <span className="h-2 w-2 rounded-full bg-slate-dim" />
                <span className="h-2 w-2 rounded-full bg-slate-dim" />
              </div>
              <Image
                src={howItWorksScreenshotMobile}
                alt="A fully executed Countersign document showing the real generated PDF, including its clause text"
                className="h-auto w-full lg:hidden"
                placeholder="blur"
              />
              <Image
                src={howItWorksScreenshot}
                alt="A fully executed Countersign document showing the real generated PDF, including its clause text"
                className="hidden h-auto w-full lg:block"
                placeholder="blur"
              />
            </div>
          </div>
        </Reveal>

        <Reveal className="mx-auto w-full max-w-5xl px-6 pb-24">
          <p className="label-strip text-slate">Why it&rsquo;s different</p>
          <p className="mt-4 max-w-xl text-slate">
            Most e-sign tools trust the interface to keep things in
            order. We don&rsquo;t.
          </p>
          <div className="mt-6 overflow-hidden rounded-lg border border-panel-border">
            {/* Mobile: stacked rows */}
            <div className="sm:hidden">
              {DIFFERENTIATOR_ROWS.map((row) => (
                <div
                  key={row.aspect}
                  className="border-b border-panel-border px-4 py-4 last:border-0"
                >
                  <p className="label-strip text-slate">{row.aspect}</p>
                  <p className="mt-2 text-sm text-slate-dim">{row.typical}</p>
                  <p className="mt-1 text-sm text-paper">{row.countersign}</p>
                </div>
              ))}
            </div>

            {/* Desktop/tablet: 3-column comparison table */}
            <div className="hidden sm:block">
              <div className="grid grid-cols-3 divide-x divide-panel-border border-b border-panel-border">
                <div className="px-5 py-3 label-strip text-slate-dim">
                  Aspect
                </div>
                <div className="px-5 py-3 label-strip text-slate-dim">
                  Typical e-sign tools
                </div>
                <div className="px-5 py-3 label-strip text-signal">
                  Countersign
                </div>
              </div>
              <div className="divide-y divide-panel-border">
                {DIFFERENTIATOR_ROWS.map((row) => (
                  <div
                    key={row.aspect}
                    className="grid grid-cols-3 divide-x divide-panel-border"
                  >
                    <div className="px-5 py-4 text-sm text-slate">
                      {row.aspect}
                    </div>
                    <div className="px-5 py-4 text-sm text-slate-dim">
                      {row.typical}
                    </div>
                    <div className="px-5 py-4 text-sm text-paper">
                      {row.countersign}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>

        <Reveal className="mx-auto w-full max-w-5xl px-6 pb-24">
          <p className="label-strip text-slate">Four templates, one system</p>
          <p className="mt-4 max-w-xl text-slate">
            Four real templates, each with its own logic &mdash; not one
            contract dressed up four ways.
          </p>
          <div className="mt-6 grid divide-y divide-panel-border sm:grid-cols-4 sm:divide-x sm:divide-y-0">
            {TEMPLATE_SHOWCASE.map((template) => (
              <div
                key={template.name}
                className="group py-5 first:pt-0 last:pb-0 sm:px-6 sm:py-0 sm:first:pl-0 sm:last:pr-0"
              >
                <h3 className="font-[family-name:var(--font-display)] text-sm font-semibold text-paper transition-colors group-hover:text-signal">
                  {template.name}
                </h3>
                <p className="mt-2 text-sm text-slate">
                  {template.description}
                </p>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal className="mx-auto w-full max-w-5xl px-6 pb-24">
          <p className="label-strip text-slate">Built to fit your stack</p>
          <p className="mt-4 max-w-xl text-slate">
            Signing isn&rsquo;t the finish line &mdash; it&rsquo;s the
            handoff. Built to flow into where your team already works:
            storage, automation, your CRM.
          </p>
          <div className="mt-8 grid grid-cols-2 gap-8 sm:grid-cols-4">
            {INTEGRATIONS.map((integration) => (
              <div
                key={integration.name}
                className="flex flex-col items-center gap-2 text-center"
              >
                {integration.kind === "brand" ? (
                  <svg
                    role="img"
                    viewBox="0 0 24 24"
                    className="h-6 w-6 text-slate"
                    fill="currentColor"
                  >
                    <path d={integration.path} />
                  </svg>
                ) : (
                  <integration.icon
                    className="h-6 w-6 text-slate"
                    strokeWidth={1.5}
                  />
                )}
                <span className="text-sm text-slate">{integration.name}</span>
              </div>
            ))}
          </div>
        </Reveal>

        <Reveal className="mx-auto w-full max-w-5xl px-6 pb-24">
          <p className="max-w-xl font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight text-paper sm:text-3xl">
            Order enforced. Every action logged. Nothing left to chance.
          </p>
          <div className="mt-8">
            <Link
              href="/login?demo=1"
              className="label-strip rounded-md bg-signal px-5 py-3 text-ink transition-colors hover:bg-signal/90"
            >
              Try the live demo
            </Link>
          </div>
        </Reveal>
      </main>

      <footer className="border-t border-panel-border">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-2 px-6 py-6">
          <span className="font-mono text-xs lowercase tracking-tight text-slate-dim">
            countersign
          </span>
          <span className="label-strip text-slate-dim">
            A fictional e-signature demo &middot; Northlight Media Group
          </span>
        </div>
      </footer>
    </div>
  );
}

function Step({
  number,
  icon: Icon,
  title,
  children,
}: {
  number: string;
  icon: LucideIcon;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2.5">
        <span className="label-strip text-slate-dim">{number}</span>
        <Icon className="h-4 w-4 text-signal" strokeWidth={1.75} />
      </div>
      <h3 className="font-[family-name:var(--font-display)] text-base font-semibold text-paper">
        {title}
      </h3>
      <p className="text-sm text-slate">{children}</p>
    </div>
  );
}
