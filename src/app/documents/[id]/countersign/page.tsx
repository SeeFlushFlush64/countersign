import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { StatusStrip } from "@/components/StatusStrip";
import { StatusBadge } from "@/components/StatusBadge";
import { formatDateTime } from "@/lib/format";
import { DocumentStatus, PartyRole } from "@/generated/prisma/enums";
import { SignForm } from "@/app/sign/[signerId]/SignForm";
import { countersignAction } from "./actions";

export const dynamic = "force-dynamic";

export default async function CountersignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?callbackUrl=/documents/${id}/countersign`);

  const document = await prisma.document.findUnique({
    where: { id },
    select: {
      id: true,
      title: true,
      status: true,
      frozenSha256: true,
      countersignerId: true,
      countersigner: { select: { isSignatory: true, sender: { select: { name: true } } } },
      signers: { select: { partyRole: true, name: true, signedAt: true } },
    },
  });
  if (!document) notFound();

  const counterparty = document.signers.find((s) => s.partyRole === PartyRole.COUNTERPARTY);
  const isDesignated =
    document.countersignerId === session.user.id && document.countersigner?.isSignatory;

  let body: React.ReactNode;
  if (!isDesignated) {
    body = (
      <p className="text-sm text-slate">
        Only {document.countersigner?.sender.name ?? "the designated countersigner"} can
        countersign this agreement.
      </p>
    );
  } else if (document.status === DocumentStatus.DRAFT || document.status === DocumentStatus.SENT) {
    body = (
      <p className="text-sm text-slate">
        Waiting on {counterparty?.name} to sign first. The countersignature
        becomes available only after the counterparty has signed.
      </p>
    );
  } else if (document.status === DocumentStatus.FULLY_EXECUTED) {
    body = <p className="text-sm text-slate">This agreement has already been executed.</p>;
  } else {
    body = (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-slate">
          {counterparty?.name} signed{" "}
          {counterparty?.signedAt ? formatDateTime(counterparty.signedAt) : ""}. Review
          the agreement, then countersign to execute it.
        </p>
        <p className="font-mono text-xs break-all text-slate-dim">
          You are countersigning the document with SHA-256 {document.frozenSha256}
        </p>
        <SignForm
          signerName={session.user.senderName}
          submitLabel="Countersign & execute"
          action={countersignAction.bind(null, document.id, document.frozenSha256 ?? "")}
        />
      </div>
    );
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-16">
      <StatusStrip
        segments={[
          <Link key="doc" href={`/documents/${document.id}`} className="hover:text-signal">
            COUNTERSIGN
          </Link>,
          "COUNTERSIGNATURE",
        ]}
      />
      <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-paper">
          {document.title}
        </h1>
        <StatusBadge status={document.status} />
      </div>

      <div className="mt-8 overflow-hidden rounded-lg border border-panel-border bg-panel">
        <iframe
          src={`/api/documents/${document.id}/pdf`}
          className="h-[560px] w-full"
          title={document.title}
        />
      </div>

      <div className="mt-8 rounded-lg border border-panel-border bg-panel p-6">{body}</div>
    </main>
  );
}
