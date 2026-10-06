import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { after } from "next/server";
import { auth } from "@/auth";
import { recordLinkView, resolveSigningLink } from "@/lib/documents";
import { requestContext } from "@/lib/request-context";
import { StatusStrip } from "@/components/StatusStrip";
import { SignForm } from "@/components/SignForm";
import { TEMPLATE_TYPE_LABELS } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";
import { DocumentStatus } from "@/generated/prisma/enums";
import { signLinkAction } from "./actions";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Signing room · Countersign",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

const PROBLEMS = {
  superseded: {
    heading: "This link has been replaced",
    body: "The sender issued a newer signing link, so this one no longer works. Use the most recent link you received.",
  },
  voided: {
    heading: "This agreement was voided",
    body: "The sender voided this agreement. It can no longer be viewed or signed here.",
  },
  expired: {
    heading: "This link has expired",
    body: "Signing links expire for your security. Ask the sender to issue a new link.",
  },
} as const;

// The counterparty's signing room. Everything here is scoped to the one
// agreement the token belongs to; an unknown, replaced, voided or expired
// link shows nothing about the agreement.
export default async function SigningRoomPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const view = await resolveSigningLink(token);
  if (view.state === "not_found") notFound();

  if (view.state !== "valid") {
    const problem = PROBLEMS[view.state];
    return (
      <main className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center px-6 py-16">
        <StatusStrip segments={["COUNTERSIGN", "SIGNING ROOM"]} />
        <h1 className="mt-4 font-[family-name:var(--font-display)] text-2xl font-semibold text-paper">
          {problem.heading}
        </h1>
        <p className="mt-2 text-sm text-slate">{problem.body}</p>
      </main>
    );
  }

  const { document, signer } = view;
  const session = await auth();
  const viewingAsCompanyUser = Boolean(session?.user?.id);

  // The view is recorded on the server, from a validated link, after the
  // response is sent — once per link. Company users previewing the link are
  // not recorded as the counterparty.
  if (!viewingAsCompanyUser) {
    const context = await requestContext();
    after(async () => {
      try {
        await recordLinkView(view.linkId, context);
      } catch (error) {
        console.error("Recording a signing-link view failed:", error);
      }
    });
  }

  let panel: React.ReactNode;
  if (document.status === DocumentStatus.FULLY_EXECUTED) {
    panel = (
      <div>
        <p className="label-strip text-live">Fully executed</p>
        <p className="mt-2 text-sm text-slate">
          Both parties have signed. You can download the executed agreement
          until {formatDateTime(view.expiresAt)}.
        </p>
        <a
          href={`/s/${token}/document?download=1`}
          className="label-strip mt-4 inline-block text-signal hover:underline"
        >
          Download executed PDF &rarr;
        </a>
      </div>
    );
  } else if (signer.signedAt) {
    panel = (
      <div>
        <p className="label-strip text-live">You signed this agreement</p>
        <p className="mt-1 text-sm text-slate">{formatDateTime(signer.signedAt)}</p>
        <p className="mt-4 text-sm text-slate">
          Waiting on {document.senderName}&rsquo;s company to countersign.
        </p>
      </div>
    );
  } else if (viewingAsCompanyUser) {
    panel = (
      <p className="text-sm text-slate">
        You&rsquo;re signed in to Countersign as a company user, so this is a
        preview: your visit is not recorded as the counterparty&rsquo;s, and
        the counterparty must sign from their own browser.
      </p>
    );
  } else if (document.status === DocumentStatus.SENT && document.frozenSha256) {
    panel = (
      <div className="flex flex-col gap-4">
        <p className="font-mono text-xs break-all text-slate-dim">
          You are signing the document with SHA-256 {document.frozenSha256}
        </p>
        <SignForm
          signerName={signer.name}
          action={signLinkAction.bind(null, token, document.frozenSha256)}
        />
      </div>
    );
  } else {
    panel = <p className="text-sm text-slate">This agreement is not awaiting your signature.</p>;
  }

  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-6 py-16">
      <StatusStrip segments={["COUNTERSIGN", "SIGNING ROOM"]} />
      <div className="mt-4">
        <h1 className="font-[family-name:var(--font-display)] text-2xl font-semibold text-paper">
          {document.title}
        </h1>
        <p className="mt-1 label-strip text-slate">
          {TEMPLATE_TYPE_LABELS[document.templateType]} &middot; requested by{" "}
          {document.senderName}
        </p>
      </div>

      <div className="mt-8 overflow-hidden rounded-lg border border-panel-border bg-panel">
        <iframe
          src={`/s/${token}/document`}
          className="h-[560px] w-full"
          title={document.title}
        />
      </div>

      <div className="mt-8 rounded-lg border border-panel-border bg-panel p-6">{panel}</div>
    </main>
  );
}
