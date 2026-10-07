import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { Ban, CircleCheck, Clock, Download, Eye, LoaderCircle, RefreshCw, ShieldCheck } from "lucide-react";
import { auth } from "@/auth";
import { recordLinkView } from "@/lib/documents";
import { getSigningRoom } from "@/lib/queries";
import { requestContext } from "@/lib/request-context";
import { ROLE_LABELS, TEMPLATE_TYPE_LABELS } from "@/lib/labels";
import { COMPANY_NAME } from "@/lib/pdf/content";
import { formatDateTime, formatLongDate } from "@/lib/format";
import { DocumentPanel } from "@/components/agreement/DocumentPanel";
import { buttonClasses } from "@/components/ui/button";
import { signLinkAction } from "./actions";
import { LinkProblem, RecipientFrame } from "./RecipientFrame";
import { RecipientSteps, type RecipientStep } from "./RecipientSteps";
import { SignAgreementForm } from "./SignAgreementForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Signing room · Countersign",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

// The counterparty's signing room. Everything here is scoped to the one
// agreement the token belongs to; an unknown, replaced, voided or expired
// link shows nothing about the agreement. The page explains, before anything
// else, who is asking, what the document is, that the counterparty signs
// first, and what happens after.
export default async function SigningRoomPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { link, details } = await getSigningRoom(token);
  if (link.state === "not_found") notFound();

  if (link.state !== "valid") {
    return (
      <RecipientFrame>
        {link.state === "superseded" ? (
          <LinkProblem icon={<RefreshCw aria-hidden className="size-6" />} title="This link was replaced">
            <p>A newer signing link was issued for this agreement, so this one no longer works.</p>
            <p>Use the most recent link you received, or ask the person who sent it for a new one.</p>
          </LinkProblem>
        ) : link.state === "voided" ? (
          <LinkProblem icon={<Ban aria-hidden className="size-6" />} title="This agreement was voided">
            <p>The sender voided this agreement, so it can no longer be viewed or signed here.</p>
            <p>If you weren&rsquo;t expecting this, contact the person who sent it to you.</p>
          </LinkProblem>
        ) : (
          <LinkProblem icon={<Clock aria-hidden className="size-6" />} title="This link has expired">
            <p>For your security, signing links stop working after a while.</p>
            <p>Ask the person who sent it to issue a new link.</p>
          </LinkProblem>
        )}
      </RecipientFrame>
    );
  }

  const { document, signer, expiresAt } = link;
  const session = await auth();
  const previewing = Boolean(session?.user?.id);

  // The view is recorded on the server, from a validated link, after the
  // response is sent — once per link. Company users previewing the link are
  // not recorded as the counterparty.
  if (!previewing) {
    const context = await requestContext();
    after(async () => {
      try {
        await recordLinkView(link.linkId, context);
      } catch (error) {
        console.error("Recording a signing-link view failed:", error);
      }
    });
  }

  const countersigner = details!.countersigner?.sender;
  const countersignerName = countersigner?.name ?? `${COMPANY_NAME}'s signatory`;
  const countersignerRole = countersigner ? `${ROLE_LABELS[countersigner.role]}, ${COMPANY_NAME}` : COMPANY_NAME;
  const executed = document.status === "FULLY_EXECUTED";
  const signedAt = signer.signedAt ?? details!.counterpartySignedAt;
  const executedArtifact = details!.artifacts.find((a) => a.kind === "EXECUTED");
  const frozenArtifact = details!.artifacts.find((a) => a.kind === "FROZEN");
  const executedReady = executedArtifact?.status === "READY";
  const canSign = document.status === "SENT" && !signer.signedAt && Boolean(document.frozenSha256);

  const mode: "sign" | "preview" | "signed" | "executed" | "closed" = executed
    ? "executed"
    : signedAt
      ? "signed"
      : canSign
        ? previewing
          ? "preview"
          : "sign"
        : "closed";

  const steps: RecipientStep[] = [
    signedAt
      ? { title: "You signed", detail: null, at: signedAt, state: "done" }
      : { title: "You review and sign", detail: "Now, on this page", state: mode === "closed" ? "ahead" : "current" },
    executed
      ? { title: `${countersignerName} countersigned`, detail: countersignerRole, at: details!.countersignedAt, state: "done" }
      : {
          title: `${countersignerName} countersigns`,
          detail: countersignerRole,
          state: mode === "signed" ? "current" : "ahead",
        },
    executed && executedReady
      ? { title: "Executed copy ready", detail: `Here, until ${formatLongDate(expiresAt)}`, state: "done" }
      : {
          title: "You download the executed copy",
          detail: executed ? "Being prepared" : "From this page, once both have signed",
          state: executed ? "current" : "ahead",
        },
  ];

  const documentNote =
    executed && executedArtifact
      ? "The agreement as signed: the original pages, unchanged, then a final page with both signatures."
      : signedAt
        ? "The exact document you signed. It cannot change after it was sent."
        : "The exact document you are asked to sign. It cannot change after it was sent.";

  return (
    <RecipientFrame>
      {mode === "preview" && (
        <div role="note" className="mb-6 flex items-start gap-3 border-y border-panel-border py-3 text-sm text-slate">
          <Eye aria-hidden className="mt-0.5 size-4 shrink-0" />
          <p>
            Preview — you&rsquo;re signed in to Countersign as a company user. This visit isn&rsquo;t recorded, and
            you can&rsquo;t sign as the counterparty here. Open the link in a private window to see their view.
          </p>
        </div>
      )}

      <header>
        {mode === "executed" ? (
          <p className="text-sm font-medium text-state-done">Executed</p>
        ) : mode === "signed" ? (
          <p className="text-sm font-medium text-state-waiting">Signed — waiting for the countersignature</p>
        ) : (
          <p className="text-sm font-medium text-signal">{COMPANY_NAME} asks you to sign</p>
        )}
        <h1 className="mt-1 font-[family-name:var(--font-display)] text-2xl leading-tight font-semibold tracking-tight text-paper lg:text-[1.75rem]">
          {document.title}
        </h1>
        <p className="mt-2 max-w-3xl text-[15px] text-slate">
          {mode === "executed" ? (
            <>
              Both signatures are in place: you signed first
              {signedAt && <> on {formatLongDate(signedAt)}</>}, and {countersignerName} countersigned for{" "}
              {COMPANY_NAME}
              {details!.countersignedAt && <> on {formatLongDate(details!.countersignedAt)}</>}.
            </>
          ) : mode === "signed" ? (
            <>
              Your signature is recorded. {countersignerName} countersigns next for {COMPANY_NAME}; when they do, the
              executed copy appears on this page.
            </>
          ) : (
            <>
              {document.senderName} at {COMPANY_NAME} sent you this {TEMPLATE_TYPE_LABELS[document.templateType]} to
              sign as {details!.counterpartyName}. You sign first. Then {countersignerName} countersigns for{" "}
              {COMPANY_NAME}, and the executed copy appears here.
            </>
          )}
        </p>
      </header>

      <section aria-label="How signing works" className="mt-8">
        <RecipientSteps steps={steps} tone={mode === "signed" ? "waiting" : "action"} />
      </section>

      <div className="mt-8 grid gap-10 border-t border-panel-border pt-8 lg:grid-cols-[minmax(0,1fr)_24rem]">
        <DocumentPanel
          id={document.id}
          title={document.title}
          kind={executed && executedArtifact ? "EXECUTED" : "FROZEN"}
          // Status only: internal generation errors are not shown to people outside the company.
          artifact={(() => {
            const shown = executed && executedArtifact ? executedArtifact : frozenArtifact;
            return shown ? { status: shown.status, attempts: 0, lastError: null } : null;
          })()}
          counterpartyName={details!.counterpartyName}
          href={`/s/${token}/document`}
          note={documentNote}
          inlineFrom="lg"
        />

        <div className="min-w-0 lg:sticky lg:top-8 lg:self-start">
          {mode === "sign" && (
            <section aria-labelledby="sign-heading">
              <h2 id="sign-heading" className="text-sm font-medium text-paper">
                Sign as {signer.name}
              </h2>
              <p className="mt-0.5 mb-4 text-[13px] text-slate">Read the document first. Draw your signature, or type your name.</p>
              <SignAgreementForm
                signerName={signer.name}
                fingerprint={document.frozenSha256!}
                action={signLinkAction.bind(null, token, document.frozenSha256!)}
              />
              <p className="mt-4 flex items-start gap-2 text-xs text-slate">
                <ShieldCheck aria-hidden className="mt-px size-4 shrink-0" />
                This private link works until {formatLongDate(expiresAt)}. Anyone who has it can sign as you, so
                don&rsquo;t forward it.
              </p>
            </section>
          )}

          {mode === "preview" && (
            <section className="text-sm text-slate">
              <h2 className="text-sm font-medium text-paper">Signing is for {details!.counterpartyName}</h2>
              <p className="mt-1">
                The counterparty signs here from their own browser. The countersignature comes after, on the
                agreement page.
              </p>
            </section>
          )}

          {mode === "signed" && (
            <section className="flex flex-col gap-3">
              <CircleCheck aria-hidden className="size-6 text-state-done" />
              <h2 className="text-lg font-medium text-paper">You&rsquo;ve signed</h2>
              <p className="text-sm text-slate">
                Signed {signedAt && formatDateTime(signedAt)} as {signer.name}. There&rsquo;s nothing else for you to
                do now.
              </p>
              <p className="text-sm text-slate">
                Come back to this link to download the executed copy once {countersignerName} has countersigned. It
                keeps working until {formatLongDate(expiresAt)}.
              </p>
            </section>
          )}

          {mode === "executed" && (
            <section aria-labelledby="receipt-heading" className="flex flex-col gap-4">
              <div>
                <h2 id="receipt-heading" className="text-lg font-medium text-paper">
                  Your executed copy
                </h2>
                <p className="mt-1 text-sm text-slate">
                  {executedReady
                    ? "Download it to keep: this page stops working after the link expires."
                    : "It is being prepared. Trying to open it starts it again if needed."}
                </p>
              </div>

              <dl className="flex flex-col gap-3 border-y border-panel-border py-4 text-sm">
                <div>
                  <dt className="text-xs text-slate">Signed first</dt>
                  <dd className="text-paper">{details!.counterpartyName} (you)</dd>
                  {signedAt && <dd className="text-[13px] text-slate">{formatDateTime(signedAt)}</dd>}
                </div>
                <div>
                  <dt className="text-xs text-slate">Countersigned</dt>
                  <dd className="text-paper">{countersignerName}</dd>
                  <dd className="text-[13px] text-slate">
                    {countersignerRole}
                    {details!.countersignedAt && <> · {formatDateTime(details!.countersignedAt)}</>}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-slate">Available here until</dt>
                  <dd className="text-paper">{formatLongDate(expiresAt)}</dd>
                </div>
              </dl>


              <div className="fixed inset-x-0 bottom-0 z-20 border-t border-panel-border bg-ink/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:static md:z-auto md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
                {executedReady ? (
                  <a href={`/s/${token}/document?download=1`} className={buttonClasses("primary", "md", "w-full")}>
                    <Download aria-hidden />
                    Download executed PDF
                  </a>
                ) : (
                  <a href={`/s/${token}/document`} target="_blank" rel="noreferrer" className={buttonClasses("secondary", "md", "w-full")}>
                    <LoaderCircle aria-hidden />
                    Executed copy is being prepared — try opening it
                  </a>
                )}
              </div>

              <details className="group text-sm">
                <summary className="flex min-h-11 cursor-pointer list-none items-center text-slate hover:text-paper lg:min-h-8 [&::-webkit-details-marker]:hidden">
                  Document fingerprints (SHA-256)
                </summary>
                <dl className="mt-2 flex flex-col gap-2 text-xs">
                  {document.frozenSha256 && (
                    <div>
                      <dt className="text-slate">As sent — what both of you signed</dt>
                      <dd className="font-mono break-all text-paper">{document.frozenSha256}</dd>
                    </div>
                  )}
                  {executedArtifact?.sha256 && (
                    <div>
                      <dt className="text-slate">Executed copy</dt>
                      <dd className="font-mono break-all text-paper">{executedArtifact.sha256}</dd>
                    </div>
                  )}
                </dl>
              </details>
            </section>
          )}

          {mode === "closed" && (
            <section className="text-sm text-slate">
              <h2 className="text-sm font-medium text-paper">Nothing to sign right now</h2>
              <p className="mt-1">This agreement isn&rsquo;t waiting for your signature.</p>
            </section>
          )}
        </div>
      </div>
    </RecipientFrame>
  );
}
