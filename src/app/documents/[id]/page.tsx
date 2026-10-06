import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/lib/session";
import { getAgreementDetail } from "@/lib/queries";
import { linkDisplay } from "@/lib/delivery/outbox";
import { canManage } from "@/lib/permissions";
import { DeliveryList } from "@/components/DeliveryList";
import { StatusStrip } from "@/components/StatusStrip";
import { StatusBadge } from "@/components/StatusBadge";
import { Timeline } from "@/components/Timeline";
import {
  ARTIFACT_KIND_LABELS,
  ARTIFACT_STATUS_LABELS,
  ROLE_LABELS,
  TEMPLATE_TYPE_LABELS,
} from "@/lib/labels";
import { formatDateTime } from "@/lib/format";
import {
  ArtifactKind,
  ArtifactStatus,
  DocumentStatus,
  PartyRole,
} from "@/generated/prisma/enums";
import { reissueLinkAction, sendDocumentAction, voidDocumentAction } from "./actions";
import { SigningLinkPanel } from "./SigningLinkPanel";
import { VoidForm } from "./VoidForm";
import { LivePoll } from "./LivePoll";

export default async function DocumentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { user } = await requireUser();

  const document = await getAgreementDetail(id);

  if (!document) notFound();

  const counterparty = document.signers.find(
    (s) => s.partyRole === PartyRole.COUNTERPARTY,
  );
  const signedCount = document.signers.filter((s) => s.signedAt).length;
  const counterpartySigned = Boolean(counterparty?.signedAt);
  const boundSend = sendDocumentAction.bind(null, document.id);
  // Reissue names the link it replaces, so a double-click or a concurrent
  // reissue cannot create a second new link.
  const boundReissue = reissueLinkAction.bind(null, document.id, document.activeLink?.id ?? null);
  const boundVoid = voidDocumentAction.bind(null, document.id);
  const viewerIsCountersigner = user.id === document.countersignerId;
  const viewerCanManage = canManage(user, document);
  const isVoided = document.status === DocumentStatus.VOIDED;
  const now = new Date();
  const link = document.activeLink;
  const linkExpired = Boolean(link && link.expiresAt <= now);
  // The PDF this page shows: the draft preview until the agreement is sent,
  // then the frozen copy, then the executed PDF once it exists.
  const shownKind = !document.sentAt
    ? ArtifactKind.PREVIEW
    : document.artifacts.some((a) => a.kind === ArtifactKind.EXECUTED)
      ? ArtifactKind.EXECUTED
      : ArtifactKind.FROZEN;
  const shownArtifact = document.artifacts.find((a) => a.kind === shownKind);
  const pdfPath = `/api/documents/${document.id}/pdf`;
  const deliveries = document.messages.map((message) => ({
    ...message,
    link: linkDisplay(message, viewerCanManage, now),
    canRetry: viewerCanManage,
  }));
  const shouldPoll =
    !isVoided &&
    (document.status === DocumentStatus.SENT ||
      document.status === DocumentStatus.PARTIALLY_SIGNED);

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

      {isVoided && (
        <div className="mt-4 rounded-lg border border-danger/40 bg-panel p-4 text-sm text-slate">
          Voided {formatDateTime(document.voidedAt!)} by{" "}
          {document.voidedBy?.sender.name ?? "a company user"}: {document.voidReason}
        </div>
      )}

      <div className="mt-10 grid gap-8 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4">
          <div className="label-strip flex items-center justify-between text-slate">
            <span>{ARTIFACT_KIND_LABELS[shownKind]}</span>
            {shownArtifact && (
              <a
                href={pdfPath}
                target="_blank"
                rel="noreferrer"
                className="text-signal hover:underline"
              >
                Open in new tab &rarr;
              </a>
            )}
          </div>
          <div className="overflow-hidden rounded-lg border border-panel-border bg-panel">
            {shownArtifact?.status === ArtifactStatus.READY ? (
              <iframe src={pdfPath} className="h-[720px] w-full" title={document.title} />
            ) : (
              <div className="flex h-[400px] flex-col items-center justify-center gap-2 px-6 text-center text-sm text-slate">
                {!shownArtifact ? (
                  <p>No PDF is stored for this agreement.</p>
                ) : (
                  <>
                    <p>
                      {shownArtifact.status === ArtifactStatus.FAILED
                        ? `PDF generation failed (${shownArtifact.attempts} attempt${shownArtifact.attempts === 1 ? "" : "s"}).`
                        : "The PDF is being generated."}{" "}
                      Opening it tries again.
                    </p>
                    {shownArtifact.lastError && (
                      <p className="text-xs text-danger">{shownArtifact.lastError}</p>
                    )}
                    <a
                      href={pdfPath}
                      target="_blank"
                      rel="noreferrer"
                      className="label-strip text-signal hover:underline"
                    >
                      Open PDF &rarr;
                    </a>
                  </>
                )}
              </div>
            )}
          </div>
          {document.artifacts.length > 0 && (
            <ul className="flex flex-col gap-1 font-mono text-[11px] break-all text-slate-dim">
              {document.artifacts
                .filter((a) => a.kind !== ArtifactKind.PREVIEW || !document.sentAt)
                .map((a) => (
                  <li key={a.kind}>
                    {ARTIFACT_KIND_LABELS[a.kind]} &middot; {ARTIFACT_STATUS_LABELS[a.status]}
                    {a.sha256 && <> &middot; SHA-256 {a.sha256}</>}
                  </li>
                ))}
            </ul>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <section className="rounded-lg border border-panel-border bg-panel p-5">
            <h2 className="label-strip mb-3 text-slate">Parties</h2>
            <dl className="flex flex-col gap-3 text-sm">
              <div>
                <dt className="text-slate-dim">
                  Sent by &middot; {ROLE_LABELS[document.sender.role]}
                </dt>
                <dd className="text-paper">{document.sender.name}</dd>
                <dd className="text-slate">{document.sender.email}</dd>
              </div>
              <div>
                <dt className="text-slate-dim">Company countersigner</dt>
                <dd className="text-paper">
                  {document.countersigner?.sender.name ?? "Not assigned"}
                </dd>
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
                  ) : signer.partyRole === PartyRole.COMPANY ? (
                    viewerIsCountersigner ? (
                      <Link
                        href={`/documents/${document.id}/countersign`}
                        className="label-strip text-signal hover:underline"
                      >
                        Countersign &rarr;
                      </Link>
                    ) : (
                      <span className="label-strip text-right text-slate-dim">
                        Awaiting
                        <br />
                        countersignature
                      </span>
                    )
                  ) : isVoided ? (
                    <span className="label-strip text-slate-dim">Voided</span>
                  ) : (
                    <span className="label-strip text-right text-slate-dim">
                      {!link
                        ? "No active link"
                        : linkExpired
                          ? "Link expired"
                          : link.firstViewedAt
                            ? `Viewed ${formatDateTime(link.firstViewedAt)}`
                            : "Link not opened yet"}
                      {link && !linkExpired && (
                        <>
                          <br />
                          Expires {formatDateTime(link.expiresAt)}
                        </>
                      )}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </section>

          {!isVoided &&
            viewerCanManage &&
            (document.status === DocumentStatus.DRAFT ||
              document.status === DocumentStatus.SENT) && (
              <SigningLinkPanel
                mode={document.status === DocumentStatus.DRAFT ? "send" : "reissue"}
                sendAction={boundSend}
                reissueAction={boundReissue}
                counterpartyName={counterparty?.name ?? "the counterparty"}
              />
            )}

          {shownKind === ArtifactKind.EXECUTED && shownArtifact && shownArtifact.status !== ArtifactStatus.READY && (
            <p className="text-xs text-alert">
              Executed. The executed PDF is{" "}
              {shownArtifact.status === ArtifactStatus.FAILED
                ? "not ready yet (generation failed and will be retried when the PDF is opened)"
                : "being generated"}
              .
            </p>
          )}

          {!isVoided &&
            viewerCanManage &&
            document.status !== DocumentStatus.FULLY_EXECUTED && (
              <section className="rounded-lg border border-panel-border bg-panel p-5">
                <VoidForm action={boundVoid} />
              </section>
            )}

          <section className="rounded-lg border border-panel-border bg-panel p-5">
            <h2 className="label-strip mb-1 text-slate">Delivery</h2>
            <p className="mb-4 text-xs text-slate-dim">
              Demo mode: no email is sent; messages go to the{" "}
              <Link href="/outbox" className="text-signal hover:underline">
                outbox
              </Link>
              .
            </p>
            <DeliveryList items={deliveries} empty="Nothing has been sent for this agreement yet." />
          </section>

          <section className="rounded-lg border border-panel-border bg-panel p-5">
            <h2 className="label-strip mb-4 text-slate">Activity</h2>
            <Timeline events={document.statusEvents} />
          </section>
        </div>
      </div>
    </main>
  );
}
