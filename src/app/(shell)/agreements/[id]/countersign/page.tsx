import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Lock } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getCountersignView } from "@/lib/queries";
import { ROLE_LABELS } from "@/lib/labels";
import { formatDateTime, formatLongDate } from "@/lib/format";
import { SequenceSteps } from "@/components/agreements/SequenceSteps";
import { DocumentPanel } from "@/components/agreement/DocumentPanel";
import { buttonClasses } from "@/components/ui/button";
import { countersignAction } from "./actions";
import { CountersignForm } from "./CountersignForm";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Countersign · Countersign" };

// The company's countersignature: the final step, available only to the
// agreement's designated signatory and only after the counterparty has
// signed. Anyone else who reaches this page is told why they cannot sign.
// (The server enforces all of this regardless; the page only explains it.)
export default async function CountersignPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireUser();

  const agreement = await getCountersignView(id);
  if (!agreement) notFound();

  const countersignerName = agreement.countersigner?.sender.name ?? "the designated countersigner";
  const isDesignated = agreement.countersignerId === user.id;
  const authorized = isDesignated && user.isSignatory && Boolean(agreement.countersigner?.isSignatory);
  const counterpartySignature = agreement.signers[0]?.signatureData ?? null;
  const backHref = `/agreements/${agreement.id}`;

  let blocked: { title: string; body: string } | null = null;
  if (agreement.status === "VOIDED") {
    blocked = { title: "This agreement was voided", body: "It can no longer be signed by anyone." };
  } else if (agreement.status === "FULLY_EXECUTED") {
    blocked = {
      title: "Already executed",
      body: `${countersignerName} countersigned on ${formatLongDate(agreement.countersignedAt!)}. The executed copy is on the agreement page.`,
    };
  } else if (!isDesignated) {
    blocked = {
      title: `Only ${countersignerName} can countersign`,
      body: `Each agreement names one company signatory when it is created, and only that person can countersign it. For this agreement that is ${countersignerName}.`,
    };
  } else if (!authorized) {
    blocked = {
      title: "Your account cannot countersign",
      body: "You are this agreement's designated countersigner, but your account is no longer authorized to sign for the company.",
    };
  } else if (agreement.status !== "PARTIALLY_SIGNED") {
    blocked = {
      title: `${agreement.counterpartyName} signs first`,
      body: `Countersigning opens once ${agreement.counterpartyName} has signed. Countersign enforces that order itself; it cannot be skipped.`,
    };
  }

  const steps = agreement.counterpartySignedAt ? 2 : agreement.status === "DRAFT" ? 0 : 1;

  return (
    <div className="w-full max-w-[76rem] px-4 pt-5 pb-28 sm:px-6 md:pb-16 lg:px-10 lg:pt-8">
      <Link
        href={backHref}
        className="-ml-2 inline-flex h-11 items-center gap-1.5 rounded-md px-2 text-sm text-slate transition-colors hover:text-paper lg:h-8"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Back to agreement
      </Link>

      <header className="mt-2">
        <p className="text-sm font-medium text-signal">Step 3 of 3 · Countersignature</p>
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl leading-tight font-semibold tracking-tight text-paper lg:text-[1.75rem]">
          {agreement.title}
        </h1>
        <div className="mt-5 max-w-sm">
          <SequenceSteps view={blocked ? "waiting-countersign" : "needs-countersign"} steps={steps} labelled />
        </div>
      </header>

      {blocked ? (
        <section className="mt-8 flex max-w-2xl items-start gap-3 border-y border-panel-border py-6">
          <Lock aria-hidden className="mt-0.5 size-5 shrink-0 text-slate" />
          <div>
            <h2 className="text-lg font-medium text-paper">{blocked.title}</h2>
            <p className="mt-1 text-sm text-slate">{blocked.body}</p>
            <Link href={backHref} className={buttonClasses("secondary", "md", "mt-4")}>
              Back to agreement
            </Link>
          </div>
        </section>
      ) : (
        <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_24rem]">
          <div className="min-w-0">
            <DocumentPanel
              id={agreement.id}
              title={agreement.title}
              kind="FROZEN"
              artifact={{ status: "READY", attempts: 0, lastError: null }}
              counterpartyName={agreement.counterpartyName}
            />
            {agreement.frozenSha256 && (
              <p className="mt-3 text-xs text-slate">
                Fingerprint{" "}
                <abbr title={`SHA-256 ${agreement.frozenSha256}`} className="font-mono text-paper no-underline">
                  {agreement.frozenSha256.slice(0, 12)}…{agreement.frozenSha256.slice(-6)}
                </abbr>{" "}
                — the copy {agreement.counterpartyName} signed. Your signature is bound to it.
              </p>
            )}
          </div>

          <div className="flex flex-col gap-8 lg:sticky lg:top-8 lg:self-start">
            <section aria-labelledby="counterparty-heading">
              <h2 id="counterparty-heading" className="text-sm font-medium text-paper">
                {agreement.counterpartyName} signed first
              </h2>
              <p className="mt-0.5 text-[13px] text-slate">
                {agreement.counterpartySignedAt && (
                  <time dateTime={agreement.counterpartySignedAt.toISOString()}>
                    {formatDateTime(agreement.counterpartySignedAt)}
                  </time>
                )}{" "}
                · through their private signing link
              </p>
              {counterpartySignature?.startsWith("data:image/png;base64,") && (
                <div className="mt-3 flex h-20 items-center rounded-md border border-panel-border bg-paper px-4">
                  {/* A validated PNG (src/lib/signature.ts), shown as an image only. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={counterpartySignature}
                    alt={`Signature of ${agreement.counterpartyName}`}
                    className="max-h-16 max-w-full object-contain"
                  />
                </div>
              )}
            </section>

            <section aria-labelledby="your-signature-heading" className="border-t border-panel-border pt-6">
              <h2 id="your-signature-heading" className="text-sm font-medium text-paper">
                Your countersignature
              </h2>
              <p className="mt-0.5 mb-4 text-[13px] text-slate">
                Signing as {agreement.countersigner!.sender.name},{" "}
                {ROLE_LABELS[agreement.countersigner!.sender.role]} — the designated company signatory for this
                agreement.
              </p>
              <CountersignForm
                signerName={agreement.countersigner!.sender.name}
                counterpartyName={agreement.counterpartyName}
                action={countersignAction.bind(null, agreement.id, agreement.frozenSha256 ?? "")}
              />
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
