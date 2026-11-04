import Link from "next/link";
import { ArrowDown, ArrowRight } from "lucide-react";
import { agreementView } from "@/lib/agreement-view";
import { SampleWorkspaceButton } from "@/components/SampleWorkspaceButton";
import { SequenceRail } from "@/components/agreement/SequenceRail";
import { StatusChip } from "@/components/ui/StatusChip";
import { buttonClasses } from "@/components/ui/button";
import { BrowserFrame } from "./Frames";
import { WRAP } from "./layout";

// The agreement shown in the timeline card, rendered by the same component
// and logic the application uses.
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

export function Hero({ signedIn }: { signedIn: boolean }) {
  return (
    <section className={`${WRAP} pt-12 pb-20 lg:pt-20 lg:pb-28`}>
      <div className="grid gap-8 lg:grid-cols-[minmax(0,13fr)_minmax(0,11fr)] lg:items-end lg:gap-14">
        <h1 className="font-[family-name:var(--font-display)] text-[2.75rem] leading-[1.04] font-semibold tracking-tight text-fg sm:text-6xl lg:text-[4rem]">
          Get every agreement signed in the right order.
        </h1>
        <div>
          <p className="text-base text-muted sm:text-lg">
            Countersign is for agreements where order matters. The counterparty signs first, then your designated
            signatory. The server and the database enforce it, the document is frozen and fingerprinted, and every step
            is on the record.
          </p>
          <div className="mt-7 flex flex-wrap items-center gap-3">
            {signedIn ? (
              <Link href="/agreements" className={buttonClasses("primary")}>
                Open your agreements
                <ArrowRight aria-hidden />
              </Link>
            ) : (
              <SampleWorkspaceButton />
            )}
            <a href="#tour" className={buttonClasses("secondary")}>
              See how it works
              <ArrowDown aria-hidden />
            </a>
          </div>
          {!signedIn && (
            <p className="mt-3 text-sm text-muted">
              Opens signed in as the company&rsquo;s General Counsel, with sample agreements at every stage.
            </p>
          )}
        </div>
      </div>

      <div className="relative mt-12 lg:mt-16">
        {/* Phones show the timeline card alone: at that width the dashboard
            capture is too small to read. */}
        <BrowserFrame
          className="hidden sm:block"
          src="/product/dashboard.png"
          width={1440}
          height={900}
          priority
          sizes="(min-width: 1152px) 1088px, 100vw"
          alt="The Countersign dashboard. A summary strip shows one agreement awaiting your countersignature, then the pipeline: drafts, awaiting counterparty, awaiting other countersigners and executed. Below it, each agreement has a status chip, a three-step progress track and the one action it offers."
        />
        <div className="relative z-10 rounded-xl border border-rule-strong bg-surface p-5 shadow-[0_24px_50px_-26px_rgba(16,28,43,0.55)] sm:mx-6 sm:-mt-10 sm:mx-6 sm:p-6 lg:absolute lg:-right-6 lg:-bottom-14 lg:mx-0 lg:mt-0 lg:w-[38rem]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-medium text-fg">Mutual NDA with Petrel Logistics Co.</p>
            <StatusChip view="waiting-countersign" />
          </div>
          <div className="mt-5">
            <SequenceRail view={SHOWN} />
          </div>
        </div>
      </div>
    </section>
  );
}
