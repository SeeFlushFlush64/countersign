"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState } from "react";
import {
  Ban,
  Check,
  Copy,
  Download,
  Ellipsis,
  LoaderCircle,
  PenLine,
  RefreshCw,
  Send,
} from "lucide-react";
import type { NextAction } from "@/lib/agreement-view";
import { LIMITS } from "@/lib/validation";
import { buttonClasses } from "@/components/ui/button";
import type { LinkState, VoidState } from "./actions";

const NO_LINK: LinkState = { error: null, signingPath: null };

// The one primary action for this viewer and state. Rendered in the page's
// action bar; on phones that bar is pinned to the bottom of the screen.
export function PrimaryAction({
  action,
  send,
  reissue,
}: {
  action: NextAction;
  send: () => Promise<LinkState>;
  reissue: () => Promise<LinkState>;
}) {
  switch (action.kind) {
    case "send":
      return <ActionForm run={send} label="Send for signature" pending="Freezing and sending…" icon={<Send aria-hidden />} />;
    case "reissue":
      return (
        <ActionForm
          run={reissue}
          label="Issue a new signing link"
          pending="Issuing…"
          icon={<RefreshCw aria-hidden />}
        />
      );
    case "share-link":
      return <CopyLink path={action.path} />;
    case "countersign":
      return (
        <Link href={action.href} className={buttonClasses("primary", "md", "w-full md:w-auto")}>
          <PenLine aria-hidden />
          Review and countersign
        </Link>
      );
    case "download":
      return (
        <a href={action.href} download className={buttonClasses("primary", "md", "w-full md:w-auto")}>
          <Download aria-hidden />
          Download executed PDF
        </a>
      );
    case "pdf-pending":
      return (
        <a href={action.href} target="_blank" rel="noreferrer" className={buttonClasses("secondary", "md", "w-full md:w-auto")}>
          <LoaderCircle aria-hidden />
          Executed PDF is being prepared — try opening it
        </a>
      );
    case "none":
      return null;
  }
}

function ActionForm({
  run,
  label,
  pending: pendingLabel,
  icon,
}: {
  run: () => Promise<LinkState>;
  label: string;
  pending: string;
  icon: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(async () => run(), NO_LINK);
  return (
    <form action={formAction} className="flex w-full flex-col items-stretch gap-2 md:w-auto md:items-end">
      <button type="submit" disabled={pending} className={buttonClasses("primary", "md", "w-full md:w-auto")}>
        {pending ? <LoaderCircle aria-hidden className="animate-spin" /> : icon}
        {pending ? pendingLabel : label}
      </button>
      {state.error && (
        <p role="alert" className="text-sm text-danger">
          {state.error}
        </p>
      )}
    </form>
  );
}

// The counterparty's current signing link (demo mode: no email is sent, so
// sharing it is the next step). Copies the absolute URL.
function CopyLink({ path }: { path: string }) {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(`${window.location.origin}${path}`);
        setCopied(true);
      }}
      className={buttonClasses("primary", "md", "w-full md:w-auto")}
    >
      {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
      {copied ? "Link copied" : "Copy signing link"}
      <span className="sr-only" aria-live="polite">
        {copied ? "Signing link copied to the clipboard" : ""}
      </span>
    </button>
  );
}

// Less common actions, out of the main path: reissuing a working link, and
// voiding (always confirmed, with a recorded reason).
export function MoreActions({
  canReissue,
  canVoid,
  reissue,
  voidAction,
  counterpartyName,
}: {
  canReissue: boolean;
  canVoid: boolean;
  reissue: () => Promise<LinkState>;
  voidAction: (state: VoidState, formData: FormData) => Promise<VoidState>;
  counterpartyName: string;
}) {
  const menu = useRef<HTMLDetailsElement>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const [reissueState, reissueForm, reissuing] = useActionState(async () => reissue(), NO_LINK);
  const [voidState, voidForm, voiding] = useActionState(voidAction, { error: null, voided: false });

  useEffect(() => {
    if (voidState.voided) dialog.current?.close();
  }, [voidState.voided]);

  if (!canReissue && !canVoid) return null;

  return (
    <div className="flex flex-col items-end gap-2">
      <details ref={menu} className="group relative">
        <summary
          className={`${buttonClasses("ghost", "md", "w-11 px-0 lg:w-10")} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
          aria-label="More actions"
        >
          <Ellipsis aria-hidden />
        </summary>
        <div className="absolute right-0 z-30 mt-1 w-64 rounded-md border border-panel-border bg-panel p-1 shadow-xl shadow-black/40">
          {canReissue && (
            <form action={reissueForm} onSubmit={() => menu.current?.removeAttribute("open")}>
              <button
                type="submit"
                disabled={reissuing}
                className="flex w-full items-start gap-3 rounded px-3 py-2.5 text-left text-sm text-paper hover:bg-panel-hover"
              >
                <RefreshCw aria-hidden className="mt-0.5 size-4 shrink-0 text-slate" />
                <span>
                  Reissue signing link
                  <span className="block text-xs text-slate">
                    Gives {counterpartyName} a new link; the current one stops working.
                  </span>
                </span>
              </button>
            </form>
          )}
          {canVoid && (
            <button
              type="button"
              onClick={() => {
                menu.current?.removeAttribute("open");
                dialog.current?.showModal();
              }}
              className="flex w-full items-start gap-3 rounded px-3 py-2.5 text-left text-sm text-danger hover:bg-danger/10"
            >
              <Ban aria-hidden className="mt-0.5 size-4 shrink-0" />
              <span>
                Void agreement…
                <span className="block text-xs text-slate">Stops it permanently; needs a reason.</span>
              </span>
            </button>
          )}
        </div>
      </details>
      {reissueState.error && (
        <p role="alert" className="text-sm text-danger">
          {reissueState.error}
        </p>
      )}
      {reissueState.signingPath && !reissueState.error && (
        <p role="status" className="text-sm text-slate">
          New link issued. The previous link no longer works.
        </p>
      )}

      <dialog
        ref={dialog}
        aria-labelledby="void-title"
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-panel-border bg-panel p-0 text-paper backdrop:bg-black/60"
      >
        <form action={voidForm} className="flex flex-col gap-4 p-5">
          <div>
            <h2 id="void-title" className="text-base font-semibold text-paper">
              Void this agreement?
            </h2>
            <p className="mt-1 text-sm text-slate">
              Voiding is permanent. {counterpartyName}&rsquo;s signing link stops working at once,
              nobody can sign it any more, and the reason is recorded in the history.
            </p>
          </div>
          <label className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-paper">Reason</span>
            <textarea
              name="reason"
              required
              minLength={LIMITS.voidReasonMin}
              maxLength={LIMITS.voidReason}
              rows={3}
              autoFocus
              className="rounded-md border border-panel-border bg-ink px-3 py-2 text-base text-paper placeholder:text-slate focus:border-signal focus:outline-none lg:text-sm"
              placeholder="e.g. The counterparty's legal name was wrong"
            />
          </label>
          {voidState.error && (
            <p role="alert" className="text-sm text-danger">
              {voidState.error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => dialog.current?.close()} className={buttonClasses("ghost")}>
              Keep agreement
            </button>
            <button type="submit" disabled={voiding} className={buttonClasses("danger")}>
              <Ban aria-hidden />
              {voiding ? "Voiding…" : "Void agreement"}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
