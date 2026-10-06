"use client";

import { useActionState, useState } from "react";
import type { LinkState } from "./actions";

// Send (draft) and reissue (awaiting the counterparty) both hand back a new
// signing link exactly once. This panel stays mounted across the draft → sent
// transition and the page's polling refreshes, so the link shown after
// sending does not disappear when the status changes.

// Only ever rendered after an action returns (never server-rendered), so
// reading window.location here is safe.
function OneTimeLink({ path }: { path: string }) {
  const url = `${window.location.origin}${path}`;
  const [copiedPath, setCopiedPath] = useState<string | null>(null);
  const copied = copiedPath === path;

  return (
    <div className="rounded-md border border-alert/40 bg-ink p-3">
      <p className="label-strip text-alert">Counterparty signing link &middot; shown once</p>
      <p className="mt-2 font-mono text-xs break-all text-paper">{url}</p>
      <button
        type="button"
        onClick={async () => {
          await navigator.clipboard.writeText(url);
          setCopiedPath(path);
        }}
        className="label-strip mt-2 text-signal hover:underline"
      >
        {copied ? "Copied" : "Copy link"}
      </button>
      <p className="mt-2 text-xs text-slate-dim">
        No email is sent in this demo: the signature request, with this link,
        is in the outbox (sealed, and shown only to the sender or
        countersigner while it works). Reissuing creates a new link and
        immediately disables this one.
      </p>
    </div>
  );
}

const EMPTY: LinkState = { error: null, signingPath: null };

export function SigningLinkPanel({
  mode,
  sendAction,
  reissueAction,
  counterpartyName,
}: {
  mode: "send" | "reissue";
  sendAction: () => Promise<LinkState>;
  reissueAction: () => Promise<LinkState>;
  counterpartyName: string;
}) {
  const [latest, setLatest] = useState<string | null>(null);
  const remember = (action: () => Promise<LinkState>) => async () => {
    const result = await action();
    if (result.signingPath) setLatest(result.signingPath);
    return result;
  };
  const [sendState, send, sending] = useActionState(remember(sendAction), EMPTY);
  const [reissueState, reissue, reissuing] = useActionState(remember(reissueAction), EMPTY);

  const error = mode === "send" ? sendState.error : reissueState.error;

  return (
    <div className="flex flex-col gap-3">
      {mode === "send" ? (
        <form action={send}>
          <button
            type="submit"
            disabled={sending}
            className="label-strip w-full rounded-md border border-signal bg-signal/10 px-4 py-3 text-paper transition-colors hover:bg-signal/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {sending ? "Freezing PDF…" : "Send for signature"}
          </button>
          <p className="mt-2 text-xs text-slate-dim">
            Freezes the PDF and its SHA-256 and creates a signing link for{" "}
            {counterpartyName}. No real email is sent in this demo; the
            request goes to the outbox.
          </p>
        </form>
      ) : (
        <form action={reissue}>
          <button
            type="submit"
            disabled={reissuing}
            className="label-strip w-full rounded-md border border-panel-border px-4 py-2.5 text-paper transition-colors hover:border-signal disabled:cursor-not-allowed disabled:opacity-50"
          >
            {reissuing ? "Reissuing…" : "Reissue signing link"}
          </button>
          <p className="mt-2 text-xs text-slate-dim">
            Creates a new link for {counterpartyName}; the current one stops
            working immediately.
          </p>
        </form>
      )}
      {error && <p className="label-strip text-danger">{error}</p>}
      {latest && <OneTimeLink path={latest} />}
    </div>
  );
}
