import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/session";
import { getAgreementDetail } from "@/lib/queries";
import { agreementView, type AgreementFacts, type AgreementView } from "@/lib/agreement-view";
import { linkDisplay } from "@/lib/delivery/outbox";
import { canManage } from "@/lib/permissions";
import { TEMPLATE_TYPE_LABELS } from "@/lib/labels";
import { formatLongDate } from "@/lib/format";
import { ArtifactKind } from "@/generated/prisma/enums";
import { SequenceRail } from "@/components/agreement/SequenceRail";
import { DocumentPanel } from "@/components/agreement/DocumentPanel";
import { Delivery, Fingerprints, History, Parties } from "@/components/agreement/AgreementDetails";
import { reissueLinkAction, sendDocumentAction, voidDocumentAction } from "./actions";
import { MoreActions, PrimaryAction } from "./AgreementActions";
import { LivePoll } from "./LivePoll";

export const dynamic = "force-dynamic";

// A fixed title: reading the agreement here would bypass the page's own
// session check.
export const metadata: Metadata = { title: "Agreement · Countersign" };

const HEADLINE_TONE: Record<AgreementView["tone"], string> = {
  action: "text-signal",
  attention: "text-alert",
  waiting: "text-paper",
  neutral: "text-paper",
  done: "text-state-done",
  void: "text-state-void",
};

export default async function AgreementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user } = await requireUser();

  const agreement = await getAgreementDetail(id);
  if (!agreement) notFound();

  const now = new Date();
  const viewerManages = canManage(user, agreement);
  const executedArtifact = agreement.artifacts.find((a) => a.kind === ArtifactKind.EXECUTED);
  const frozenArtifact = agreement.artifacts.find((a) => a.kind === ArtifactKind.FROZEN);

  // The counterparty's current link, from the message that delivered it —
  // only for someone who manages the agreement, and only while it works.
  const linkMessage = agreement.activeLink
    ? [...agreement.messages].reverse().find((m) => m.signingLinkId === agreement.activeLink!.id && m.linkCiphertext)
    : undefined;
  const link = linkMessage ? linkDisplay(linkMessage, viewerManages, now) : null;

  const facts: AgreementFacts = {
    id: agreement.id,
    status: agreement.status,
    createdAt: agreement.createdAt,
    sentAt: agreement.sentAt,
    counterpartySignedAt: agreement.counterpartySignedAt,
    countersignedAt: agreement.countersignedAt,
    voidedAt: agreement.voidedAt,
    voidReason: agreement.voidReason,
    voidedByName: agreement.voidedBy?.sender.name ?? null,
    senderId: agreement.senderId,
    senderName: agreement.sender.name,
    countersignerId: agreement.countersignerId,
    countersignerName: agreement.countersigner?.sender.name ?? null,
    countersignerIsSignatory: agreement.countersigner?.isSignatory ?? false,
    counterpartyName: agreement.counterpartyName,
    activeLink: agreement.activeLink,
    executedPdf: !executedArtifact
      ? "none"
      : executedArtifact.status === "READY"
        ? "ready"
        : executedArtifact.status === "FAILED"
          ? "failed"
          : "pending",
    shareablePath: link?.state === "active" ? link.path : null,
  };
  const view = agreementView(facts, user, now);

  const shownKind = !agreement.sentAt
    ? ArtifactKind.PREVIEW
    : executedArtifact
      ? ArtifactKind.EXECUTED
      : ArtifactKind.FROZEN;
  const shownArtifact = agreement.artifacts.find((a) => a.kind === shownKind) ?? null;

  const waiting = agreement.status === "SENT" || agreement.status === "PARTIALLY_SIGNED";
  const send = sendDocumentAction.bind(null, agreement.id);
  const reissue = reissueLinkAction.bind(null, agreement.id, agreement.activeLink?.id ?? null);
  const voidAction = voidDocumentAction.bind(null, agreement.id);
  const hasPrimary = view.action.kind !== "none";

  return (
    <div className={`w-full max-w-[76rem] px-4 pt-5 sm:px-6 lg:px-10 lg:pt-8 ${hasPrimary ? "pb-28 md:pb-16" : "pb-16"}`}>
      {waiting && <LivePoll />}

      <Link
        href="/agreements"
        className="-ml-2 inline-flex h-11 items-center gap-1.5 rounded-md px-2 text-sm text-slate transition-colors hover:text-paper lg:h-8"
      >
        <ArrowLeft aria-hidden className="size-4" />
        Agreements
      </Link>

      <header className="mt-2 flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-[family-name:var(--font-display)] text-2xl leading-tight font-semibold tracking-tight text-paper lg:text-[1.75rem]">
            {agreement.title}
          </h1>
          <p className="mt-1.5 text-sm text-slate">
            {TEMPLATE_TYPE_LABELS[agreement.templateType]} · with {agreement.counterpartyName} · created{" "}
            {formatLongDate(agreement.createdAt)} by {agreement.sender.name}
          </p>
        </div>
        <MoreActions
          canReissue={view.canReissue && view.action.kind !== "reissue"}
          canVoid={view.canVoid}
          reissue={reissue}
          voidAction={voidAction}
          counterpartyName={agreement.counterpartyName}
        />
      </header>

      <section aria-label="Signing sequence" className="mt-8 lg:mt-10">
        <SequenceRail view={view} />
      </section>

      {/* What happens next, and the one thing this viewer can do about it */}
      <section
        aria-label="Next step"
        className="mt-8 flex flex-col gap-4 border-y border-panel-border py-5 md:flex-row md:items-center md:justify-between md:gap-10"
      >
        <div className="min-w-0">
          <p className={`text-lg leading-snug font-medium ${HEADLINE_TONE[view.tone]}`}>{view.headline}</p>
          <p className="mt-1 max-w-2xl text-sm text-slate">{view.explanation}</p>
          {view.action.kind === "share-link" && agreement.activeLink && (
            <p className="mt-2 text-[13px] text-slate">
              Demo mode sends no email: share this link with {agreement.counterpartyName}. It expires{" "}
              {formatLongDate(agreement.activeLink.expiresAt)} and is also in the{" "}
              <Link href="/outbox" className="text-signal hover:underline">
                outbox
              </Link>
              .
            </p>
          )}
        </div>
        {hasPrimary && (
          <div className="fixed inset-x-0 bottom-0 z-20 border-t border-panel-border bg-ink/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:static md:z-auto md:shrink-0 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
            <PrimaryAction action={view.action} send={send} reissue={reissue} />
          </div>
        )}
      </section>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <DocumentPanel
          id={agreement.id}
          title={agreement.title}
          kind={shownKind}
          artifact={shownArtifact}
          counterpartyName={agreement.counterpartyName}
        />

        <aside aria-label="Agreement details" className="min-w-0">
          <Parties
            counterparty={{ name: agreement.counterpartyName, email: agreement.counterpartyEmail }}
            countersigner={
              agreement.countersigner
                ? {
                    name: agreement.countersigner.sender.name,
                    email: agreement.countersigner.email,
                    role: agreement.countersigner.sender.role,
                    isSignatory: agreement.countersigner.isSignatory,
                    you: agreement.countersignerId === user.id,
                  }
                : null
            }
            sender={{
              name: agreement.sender.name,
              email: agreement.sender.email,
              role: agreement.sender.role,
              you: user.senderId === agreement.senderId,
              sent: agreement.sentAt !== null,
            }}
          />
          <Delivery messages={agreement.messages} canRetry={viewerManages} />
          <History events={agreement.statusEvents} agreementId={agreement.id} />
          <Fingerprints frozen={frozenArtifact?.sha256 ?? agreement.frozenSha256} executed={executedArtifact?.sha256 ?? null} />
        </aside>
      </div>
    </div>
  );
}
