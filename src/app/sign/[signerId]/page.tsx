import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { StatusStrip } from "@/components/StatusStrip";
import { StatusBadge } from "@/components/StatusBadge";
import { TEMPLATE_TYPE_LABELS } from "@/lib/labels";
import { DocumentStatus, PartyRole } from "@/generated/prisma/enums";
import { formatDateTime } from "@/lib/format";
import { SignForm } from "./SignForm";
import { ViewTracker } from "./ViewTracker";

export default async function SignPage({
  params,
}: {
  params: Promise<{ signerId: string }>;
}) {
  const { signerId } = await params;

  const signer = await prisma.signer.findUnique({
    where: { id: signerId },
    include: { document: { include: { signers: true, sender: true } } },
  });

  if (!signer) notFound();

  const document = signer.document;
  const isDraft = document.status === DocumentStatus.DRAFT;

  const otherSigner = document.signers.find((s) => s.id !== signer.id);
  const waitingOnOtherSigner =
    !isDraft &&
    !signer.signedAt &&
    signer.partyRole === PartyRole.COMPANY &&
    !otherSigner?.signedAt;

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-16">
      {!signer.signedAt && !isDraft && <ViewTracker signerId={signerId} />}
      <StatusStrip
        segments={[
          <Link key="home" href="/" className="hover:text-signal">
            COUNTERSIGN
          </Link>,
          "SIGNING ROOM",
          signer.partyRole === PartyRole.COMPANY ? "COMPANY" : "COUNTERPARTY",
        ]}
      />

      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-paper">
            {document.title}
          </h1>
          <p className="mt-1 label-strip text-slate">
            {TEMPLATE_TYPE_LABELS[document.templateType]} &middot; requested by{" "}
            {document.sender.name}
          </p>
        </div>
        <StatusBadge status={document.status} />
      </div>

      <div className="mt-8 overflow-hidden rounded-lg border border-panel-border bg-panel">
        {document.pdfUrl ? (
          <iframe
            src={document.pdfUrl}
            className="h-[560px] w-full"
            title={document.title}
          />
        ) : (
          <div className="flex h-[300px] items-center justify-center text-sm text-slate">
            Generating PDF&hellip;
          </div>
        )}
      </div>

      <div className="mt-8 rounded-lg border border-panel-border bg-panel p-6">
        {isDraft ? (
          <p className="label-strip text-slate">
            This document has not been sent for signature yet.
          </p>
        ) : waitingOnOtherSigner ? (
          <div>
            <p className="label-strip text-alert">
              Waiting on {otherSigner?.name} to sign first
            </p>
            <p className="mt-2 text-sm text-slate">
              Countersign requires the counterparty&rsquo;s signature before
              {" "}{document.sender.name} can countersign. You&rsquo;ll be able
              to sign here once {otherSigner?.name} has completed their
              signature.
            </p>
          </div>
        ) : signer.signedAt ? (
          <div>
            <p className="label-strip text-live">
              You signed this document
            </p>
            <p className="mt-1 text-sm text-slate">
              {formatDateTime(signer.signedAt)}
            </p>
            {otherSigner && !otherSigner.signedAt && (
              <p className="mt-4 text-sm text-slate">
                Waiting on {otherSigner.name} to countersign.
              </p>
            )}
            {document.status === DocumentStatus.FULLY_EXECUTED && (
              <p className="mt-4 text-sm text-paper">
                Both parties have signed. This document is fully executed.
              </p>
            )}
          </div>
        ) : (
          <SignForm signerId={signer.id} signerName={signer.name} />
        )}
      </div>
    </main>
  );
}
