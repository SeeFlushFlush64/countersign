import type { Metadata } from "next";
import Link from "next/link";
import { Ban, Clock, Inbox, MailX, TriangleAlert, type LucideIcon } from "lucide-react";
import type { DeliveryStatus } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/session";
import { listOutbox, type OutboxMessage } from "@/lib/queries";
import { linkDisplay, MAX_AUTOMATIC_ATTEMPTS, type LinkDisplay } from "@/lib/delivery/outbox";
import { canManage } from "@/lib/permissions";
import { MESSAGE_KIND_LABELS } from "@/lib/labels";
import { formatDateTime, formatRelative } from "@/lib/format";
import { ActionButton } from "@/components/ActionButton";
import { EmptyState } from "@/components/ui/EmptyState";
import { dispatchDueAction, retryDeliveryAction } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Demo outbox · Countersign" };

// The demo outbox: every notification Countersign would have emailed, with
// what happened to it. In demo mode nothing leaves the app — this page is
// where the messages go.

const STATUS: Record<DeliveryStatus, { icon: LucideIcon; tone: string; text: (m: OutboxMessage) => string }> = {
  DELIVERED: { icon: Inbox, tone: "text-state-done", text: () => "Delivered to this outbox" },
  PENDING: { icon: Clock, tone: "text-state-waiting", text: () => "Queued" },
  SENDING: { icon: Clock, tone: "text-state-waiting", text: () => "Delivering" },
  FAILED: {
    icon: TriangleAlert,
    tone: "text-alert",
    text: (m) => `Delivery failed after ${m.attempts} attempt${m.attempts === 1 ? "" : "s"}`,
  },
  CANCELLED: { icon: Ban, tone: "text-slate", text: () => "Not sent" },
};

const needsAttention = (m: OutboxMessage) => m.status === "FAILED" || m.status === "PENDING";
// What "Deliver queued" would actually pick up (see dispatchDueMessages):
// never-attempted messages and failures still within the automatic retries.
const due = (m: OutboxMessage) =>
  m.status === "PENDING" || (m.status === "FAILED" && m.attempts < MAX_AUTOMATIC_ATTEMPTS);

function SigningLink({ link }: { link: LinkDisplay }) {
  switch (link.state) {
    case "none":
      return null;
    case "active":
      return (
        <p className="mt-3 text-[13px] text-slate">
          Signing link{" "}
          <a href={link.path} target="_blank" rel="noreferrer" className="font-mono break-all text-signal hover:underline">
            {link.path}
          </a>
          <span className="mt-0.5 block text-xs">
            To act as the counterparty, open it in a private window — a browser signed in to Countersign can&rsquo;t sign
            for them.
          </span>
        </p>
      );
    case "hidden":
      return (
        <p className="mt-3 text-xs text-slate">
          Signing link hidden: only the agreement&rsquo;s sender or designated countersigner can see it.
        </p>
      );
    case "inactive":
      return <p className="mt-3 text-xs text-slate">Its signing link no longer works (replaced, voided or expired).</p>;
    case "unreadable":
      return (
        <p className="mt-3 text-xs text-danger">The signing link can&rsquo;t be read with the current encryption key.</p>
      );
  }
}

export default async function OutboxPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[] }>;
}) {
  const { user } = await requireUser();
  const attentionOnly = (await searchParams)?.view === "attention";
  const messages = await listOutbox();
  const now = new Date();
  const attention = messages.filter(needsAttention);
  const shown = attentionOnly ? attention : messages;

  return (
    <div className="w-full max-w-[76rem] px-4 pt-6 pb-16 sm:px-6 lg:px-10 lg:pt-10">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-[family-name:var(--font-display)] text-2xl leading-tight font-semibold tracking-tight text-paper lg:text-[1.75rem]">
            Demo outbox
          </h1>
          <p className="mt-2 max-w-2xl text-base text-paper">No email is sent.</p>
          <p className="mt-0.5 max-w-2xl text-sm text-slate">
            Countersign is a demo, so every notification it would email is recorded here instead: who it was for,
            what it said, and what happened to it.
          </p>
        </div>
        {messages.some(due) && (
          <ActionButton action={dispatchDueAction} label="Deliver queued" pendingLabel="Delivering…" />
        )}
      </header>

      <nav aria-label="Outbox views" className="mt-7 border-b border-panel-border">
        <ul className="flex">
          {[
            { href: "/outbox", label: "All", count: messages.length, active: !attentionOnly },
            { href: "/outbox?view=attention", label: "Needs attention", count: attention.length, active: attentionOnly },
          ].map((tab) => (
            <li key={tab.href}>
              <Link
                href={tab.href}
                aria-current={tab.active ? "page" : undefined}
                className={`relative flex h-11 items-center gap-1.5 px-3 text-sm font-medium transition-colors ${
                  tab.active ? "text-paper" : "text-slate hover:text-paper"
                }`}
              >
                {tab.label}
                <span className={`text-xs tabular-nums ${tab.label === "Needs attention" && tab.count > 0 ? "font-semibold text-alert" : "text-slate"}`}>
                  {tab.count}
                </span>
                {tab.active && <span aria-hidden className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-signal" />}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {shown.length === 0 ? (
        <EmptyState
          icon={attentionOnly ? Inbox : MailX}
          title={attentionOnly ? "Nothing needs attention" : "No messages yet"}
        >
          {attentionOnly
            ? "Every message was delivered to this outbox or deliberately not sent."
            : "Sending an agreement records its first message here."}
        </EmptyState>
      ) : (
        <ol className="divide-y divide-panel-border border-b border-panel-border">
          {shown.map((m) => {
            const status = STATUS[m.status];
            const Icon = status.icon;
            const manager = canManage(user, m.document);
            const at = m.deliveredAt ?? m.cancelledAt ?? m.lastAttemptAt ?? m.createdAt;
            return (
              <li key={m.id} className="flex gap-3 px-4 py-4 sm:gap-4 sm:px-5">
                <Icon aria-hidden className={`mt-0.5 size-[18px] shrink-0 ${status.tone}`} />
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] leading-snug font-medium break-words text-paper">
                    {MESSAGE_KIND_LABELS[m.kind]}{" "}
                    <span className="font-normal text-slate">
                      to {m.recipientName} &lt;{m.recipientEmail}&gt;
                    </span>
                  </p>
                  <p className="mt-0.5 text-[13px] text-slate">
                    <Link href={`/agreements/${m.documentId}`} className="text-slate underline-offset-2 hover:text-paper hover:underline">
                      {m.document.title}
                    </Link>
                  </p>
                  <p className={`mt-0.5 text-[13px] ${m.status === "FAILED" ? "text-alert" : "text-slate"}`}>
                    {status.text(m)} ·{" "}
                    <time dateTime={at.toISOString()} title={formatDateTime(at)}>
                      {formatRelative(at, now)}
                    </time>
                  </p>
                  {m.lastError && m.status !== "DELIVERED" && (
                    <p className="mt-1 text-xs text-slate">{m.lastError}</p>
                  )}
                  {manager && (m.status === "FAILED" || m.status === "PENDING") && (
                    <div className="mt-2">
                      <ActionButton
                        action={retryDeliveryAction.bind(null, m.id)}
                        label={m.status === "FAILED" ? "Retry delivery" : "Deliver now"}
                        pendingLabel="Delivering…"
                      />
                    </div>
                  )}
                  <details className="group mt-1">
                    <summary className="flex min-h-11 cursor-pointer list-none items-center text-[13px] text-signal hover:underline lg:min-h-8 [&::-webkit-details-marker]:hidden">
                      <span className="group-open:hidden">Show message</span>
                      <span className="hidden group-open:inline">Hide message</span>
                    </summary>
                    <div className="border-l-2 border-panel-border pb-1 pl-4">
                      <p className="text-sm font-medium text-paper">{m.subject}</p>
                      <p className="mt-1.5 text-sm whitespace-pre-line text-slate">{m.body}</p>
                      {m.appPath && (
                        <p className="mt-3 text-[13px] text-slate">
                          Link in the message{" "}
                          <Link href={m.appPath} className="font-mono break-all text-signal hover:underline">
                            {m.appPath}
                          </Link>
                        </p>
                      )}
                      <SigningLink link={linkDisplay(m, manager, now)} />
                    </div>
                  </details>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}
