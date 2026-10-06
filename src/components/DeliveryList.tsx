import Link from "next/link";
import type { DeliveryStatus, MessageKind } from "@/generated/prisma/enums";
import type { LinkDisplay } from "@/lib/delivery/outbox";
import { DELIVERY_STATUS_LABELS, MESSAGE_KIND_LABELS } from "@/lib/labels";
import { formatDateTime } from "@/lib/format";
import { retryDeliveryAction } from "@/app/(shell)/outbox/actions";
import { ActionButton } from "./ActionButton";

const DOT_CLASS: Record<DeliveryStatus, string> = {
  PENDING: "bg-slate-dim",
  SENDING: "bg-alert",
  DELIVERED: "bg-live",
  FAILED: "bg-danger",
  CANCELLED: "bg-slate-dim",
};

export type DeliveryItem = {
  id: string;
  kind: MessageKind;
  recipientName: string;
  recipientEmail: string;
  subject: string;
  body: string;
  appPath: string | null;
  status: DeliveryStatus;
  attempts: number;
  lastError: string | null;
  createdAt: Date;
  lastAttemptAt: Date | null;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  link: LinkDisplay;
  canRetry: boolean;
  document?: { id: string; title: string };
};

function SigningLink({ link }: { link: LinkDisplay }) {
  switch (link.state) {
    case "none":
      return null;
    case "active":
      return (
        <p className="mt-2 text-xs text-slate">
          Signing link:{" "}
          <a href={link.path} target="_blank" rel="noreferrer" className="break-all font-mono text-signal hover:underline">
            {link.path}
          </a>
          <br />
          <span className="text-slate-dim">
            Open it in a private window: a browser signed in to Countersign cannot sign as the
            counterparty.
          </span>
        </p>
      );
    case "hidden":
      return (
        <p className="mt-2 text-xs text-slate-dim">
          Signing link hidden: only the sender or the designated countersigner can see it.
        </p>
      );
    case "inactive":
      return (
        <p className="mt-2 text-xs text-slate-dim">
          Signing link no longer works (replaced, voided or expired).
        </p>
      );
    case "unreadable":
      return (
        <p className="mt-2 text-xs text-danger">
          Signing link cannot be decrypted with the current OUTBOX_ENCRYPTION_KEY.
        </p>
      );
  }
}

export function DeliveryList({ items, empty }: { items: DeliveryItem[]; empty: string }) {
  if (items.length === 0) return <p className="text-sm text-slate">{empty}</p>;

  return (
    <ul className="flex flex-col divide-y divide-panel-border">
      {items.map((item) => (
        <li key={item.id} className="py-3 first:pt-0 last:pb-0">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5 text-sm text-paper">
              <span className={`h-1.5 w-1.5 rounded-full ${DOT_CLASS[item.status]}`} />
              {MESSAGE_KIND_LABELS[item.kind]}
            </span>
            <span className="label-strip text-slate">{DELIVERY_STATUS_LABELS[item.status]}</span>
          </div>
          {item.document && (
            <Link href={`/documents/${item.document.id}`} className="text-xs text-slate hover:text-signal">
              {item.document.title}
            </Link>
          )}
          <p className="mt-1 text-xs text-slate">
            To {item.recipientName} &lt;{item.recipientEmail}&gt;
          </p>
          <details className="mt-1 text-xs">
            <summary className="cursor-pointer text-slate hover:text-paper">{item.subject}</summary>
            <p className="mt-2 whitespace-pre-line text-slate">{item.body}</p>
            {item.appPath && (
              <p className="mt-2 text-slate">
                Link in message:{" "}
                <Link href={item.appPath} className="font-mono text-signal hover:underline">
                  {item.appPath}
                </Link>
              </p>
            )}
          </details>
          <SigningLink link={item.link} />
          <p className="mt-2 font-mono text-[11px] text-slate-dim">
            Queued {formatDateTime(item.createdAt)}
            {item.deliveredAt && <> &middot; delivered {formatDateTime(item.deliveredAt)}</>}
            {item.cancelledAt && <> &middot; cancelled {formatDateTime(item.cancelledAt)}</>}
            {item.attempts > 0 && (
              <>
                {" "}
                &middot; {item.attempts} attempt{item.attempts === 1 ? "" : "s"}
                {item.lastAttemptAt && <>, last {formatDateTime(item.lastAttemptAt)}</>}
              </>
            )}
          </p>
          {item.lastError && item.status !== "DELIVERED" && (
            <p className={`mt-1 text-xs ${item.status === "FAILED" ? "text-danger" : "text-slate-dim"}`}>
              {item.lastError}
            </p>
          )}
          {item.canRetry && (item.status === "FAILED" || item.status === "PENDING") && (
            <div className="mt-2">
              <ActionButton
                action={retryDeliveryAction.bind(null, item.id)}
                label={item.status === "FAILED" ? "Retry delivery" : "Deliver now"}
                pendingLabel="Delivering…"
              />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
