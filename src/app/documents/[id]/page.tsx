import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { StatusStrip } from "@/components/StatusStrip";
import { StatusBadge } from "@/components/StatusBadge";
import { Timeline } from "@/components/Timeline";
import {
  ROLE_LABELS,
  TEMPLATE_TYPE_LABELS,
} from "@/lib/labels";
import { formatDateTime } from "@/lib/format";
import { DocumentStatus, PartyRole } from "@/generated/prisma/enums";
import { sendDocumentAction } from "./actions";
import { LivePoll } from "./LivePoll";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  const document = await prisma.document.findUnique({
    where: { id },
    include: {
      sender: true,
      signers: true,
      statusEvents: { orderBy: { timestamp: "asc" } },
    },
  });

  if (!document) notFound();

  const company = document.signers.find((s) => s.partyRole === PartyRole.COMPANY);
  const counterparty = document.signers.find(
    (s) => s.partyRole === PartyRole.COUNTERPARTY,
  );
  const signedCount = document.signers.filter((s) => s.signedAt).length;
  const counterpartySigned = Boolean(counterparty?.signedAt);
  const boundSend = sendDocumentAction.bind(null, document.id);
  const shouldPoll =
    document.status === DocumentStatus.SENT ||
    document.status === DocumentStatus.PARTIALLY_SIGNED;

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-6 py-16">
      {shouldPoll && <LivePoll />}
      <StatusStrip
        segments={[
          <Link key="home" href="/" className="hover:text-signal">
            COUNTERSIGN
          </Link>,
          `DOC ${document.id.slice(-8).toUpperCase()}`,
          `${signedCount} OF ${document.signers.length} SIGNED`,
          formatDateTime(document.createdAt),
        ]}
      />

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-paper">
            {document.title}
          </h1>
          <p className="mt-1 label-strip text-slate">
            {TEMPLATE_TYPE_LABELS[document.templateType]}
          </p>
        </div>
        <StatusBadge status={document.status} />
      </div>

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4">
          <div className="label-strip flex items-center justify-between text-slate">
            <span>Generated PDF</span>
            {document.pdfUrl && (
              <a
                href={document.pdfUrl}
                target="_blank"
                rel="noreferrer"
                className="text-signal hover:underline"
              >
                Open in new tab &rarr;
              </a>
            )}
          </div>
          <div className="overflow-hidden rounded-lg border border-panel-border bg-panel">
            {document.pdfUrl ? (
              <iframe
                src={document.pdfUrl}
                className="h-[720px] w-full"
                title={document.title}
              />
            ) : (
              <div className="flex h-[400px] items-center justify-center text-sm text-slate">
                Generating PDF&hellip;
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-6">
          <section className="rounded-lg border border-panel-border bg-panel p-5">
            <h2 className="label-strip mb-3 text-slate">Parties</h2>
            <dl className="flex flex-col gap-3 text-sm">
              <div>
                <dt className="text-slate-dim">
                  Company &middot; {ROLE_LABELS[document.sender.role]}
                </dt>
                <dd className="text-paper">{document.sender.name}</dd>
                <dd className="text-slate">{document.sender.email}</dd>
              </div>
              <div>
                <dt className="text-slate-dim">Counterparty</dt>
                <dd className="text-paper">{document.counterpartyName}</dd>
                <dd className="text-slate">{document.counterpartyEmail}</dd>
              </div>
            </dl>
          </section>

          <section className="rounded-lg border border-panel-border bg-panel p-5">
            <h2 className="label-strip mb-3 text-slate">Signers</h2>
            <ul className="flex flex-col gap-3">
              {document.signers.map((signer) => (
                <li
                  key={signer.id}
                  className="flex items-center justify-between gap-3 text-sm"
                >
                  <div>
                    <p className="text-paper">{signer.name}</p>
                    <p className="label-strip text-slate-dim">
                      {signer.partyRole === PartyRole.COMPANY
                        ? "Company"
                        : "Counterparty"}
                    </p>
                  </div>
                  {signer.signedAt ? (
                    <span className="label-strip text-live">Signed</span>
                  ) : document.status === DocumentStatus.DRAFT ? (
                    <span className="label-strip text-slate-dim">Not sent</span>
                  ) : signer.partyRole === PartyRole.COMPANY &&
                    !counterpartySigned ? (
                    <span className="label-strip text-right text-slate-dim">
                      Awaiting counterparty
                      <br />
                      signature
                    </span>
                  ) : (
                    <Link
                      href={`/sign/${signer.id}`}
                      className="label-strip text-signal hover:underline"
                    >
                      Sign link &rarr;
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {document.status === DocumentStatus.DRAFT && (
            <form action={boundSend}>
              <button
                type="submit"
                className="label-strip w-full rounded-md border border-signal bg-signal/10 px-4 py-3 text-paper transition-colors hover:bg-signal/20"
              >
                Send for signature
              </button>
              <p className="mt-2 text-xs text-slate-dim">
                Simulates emailing {company?.name} and {counterparty?.name} —
                no real email is sent in this demo.
              </p>
            </form>
          )}

          <section className="rounded-lg border border-panel-border bg-panel p-5">
            <h2 className="label-strip mb-4 text-slate">Activity</h2>
            <Timeline events={document.statusEvents} />
          </section>
        </div>
      </div>
    </main>
  );
}
