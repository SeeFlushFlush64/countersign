import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { DeliveryStatus, MessageKind, Role, StatusEventType } from "@/generated/prisma/enums";
import { DELIVERY_STATUS_LABELS, MESSAGE_KIND_LABELS, ROLE_LABELS } from "@/lib/labels";
import { eventLabel } from "@/lib/audit-evidence";
import { formatDateTime } from "@/lib/format";
import { retryDeliveryAction } from "@/app/(shell)/outbox/actions";
import { ActionButton } from "@/components/ActionButton";

// Supporting information, kept quiet so it never competes with the sequence
// and the next action: who is involved (always shown), then delivery,
// history and document fingerprints (collapsed unless something needs
// attention).

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-panel-border py-5 first:border-t-0 first:pt-0">
      <h2 className="mb-3 text-sm font-medium text-paper">{title}</h2>
      {children}
    </section>
  );
}

function Collapsible({
  title,
  summary,
  open,
  children,
}: {
  title: string;
  summary: React.ReactNode;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={open} className="group border-t border-panel-border py-1.5 lg:py-3">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-sm lg:min-h-8 [&::-webkit-details-marker]:hidden">
        <ChevronRight aria-hidden className="size-4 shrink-0 text-slate transition-transform group-open:rotate-90" />
        <span className="text-sm font-medium text-paper">{title}</span>
        <span className="ml-auto text-xs text-slate">{summary}</span>
      </summary>
      <div className="mt-2 pb-3 pl-6">{children}</div>
    </details>
  );
}

type Person = { name: string; email: string; you: boolean };

export function Parties({
  counterparty,
  countersigner,
  sender,
}: {
  counterparty: { name: string; email: string };
  countersigner: (Person & { role: Role; isSignatory: boolean }) | null;
  sender: Person & { role: Role; sent: boolean };
}) {
  return (
    <Section title="Who is involved">
      <dl className="flex flex-col gap-4 text-sm">
        <div>
          <dt className="text-xs text-slate">Signs first · counterparty</dt>
          <dd className="mt-0.5 text-paper">{counterparty.name}</dd>
          <dd className="break-all text-slate">{counterparty.email}</dd>
        </div>
        <div>
          <dt className="text-xs text-slate">Countersigns second · designated company signatory</dt>
          {countersigner ? (
            <>
              <dd className="mt-0.5 text-paper">
                {countersigner.name}
                {countersigner.you && <span className="text-slate"> (you)</span>}
              </dd>
              <dd className="text-slate">{ROLE_LABELS[countersigner.role]}</dd>
              <dd className="mt-1 text-xs text-slate">
                {countersigner.isSignatory
                  ? "Chosen when the agreement was created. No one else can countersign it."
                  : "No longer authorized to countersign."}
              </dd>
            </>
          ) : (
            <dd className="mt-0.5 text-slate">Not assigned</dd>
          )}
        </div>
        <div>
          <dt className="text-xs text-slate">{sender.sent ? "Prepared and sent by" : "Prepared by"}</dt>
          <dd className="mt-0.5 text-paper">
            {sender.name}
            {sender.you && <span className="text-slate"> (you)</span>}
          </dd>
          <dd className="text-slate">{ROLE_LABELS[sender.role]}</dd>
        </div>
      </dl>
    </Section>
  );
}

export type DeliveryRow = {
  id: string;
  kind: MessageKind;
  recipientName: string;
  status: DeliveryStatus;
  lastError: string | null;
  createdAt: Date;
  deliveredAt: Date | null;
};

export function Delivery({ messages, canRetry }: { messages: DeliveryRow[]; canRetry: boolean }) {
  const failed = messages.filter((m) => m.status === "FAILED").length;
  const summary =
    messages.length === 0
      ? "Nothing sent yet"
      : failed > 0
        ? `${failed} failed`
        : `${messages.length} in demo outbox`;

  return (
    <Collapsible title="Delivery" summary={<span className={failed ? "text-danger" : undefined}>{summary}</span>} open={failed > 0}>
      {messages.length === 0 ? (
        <p className="text-sm text-slate">Notifications appear here once the agreement is sent.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {messages.map((m) => (
            <li key={m.id} className="text-sm">
              <p className="text-paper">
                {MESSAGE_KIND_LABELS[m.kind]} <span className="text-slate">to {m.recipientName}</span>
              </p>
              <p className={`text-xs ${m.status === "FAILED" ? "text-danger" : "text-slate"}`}>
                {DELIVERY_STATUS_LABELS[m.status]} · {formatDateTime(m.deliveredAt ?? m.createdAt)}
              </p>
              {m.status === "FAILED" && m.lastError && <p className="mt-0.5 text-xs text-slate">{m.lastError}</p>}
              {m.status === "FAILED" && canRetry && (
                <div className="mt-2">
                  <ActionButton action={retryDeliveryAction.bind(null, m.id)} label="Retry delivery" pendingLabel="Retrying…" />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-slate">
        Demo mode sends no email.{" "}
        <Link href="/outbox" className="text-signal hover:underline">
          Open the outbox
        </Link>
      </p>
    </Collapsible>
  );
}

export type HistoryEvent = { id: string; eventType: StatusEventType; actor: string; timestamp: Date; actorType: string | null };

export function History({ events, agreementId }: { events: HistoryEvent[]; agreementId: string }) {
  return (
    <Collapsible title="History" summary={`${events.length} event${events.length === 1 ? "" : "s"}`}>
      <ol className="flex flex-col gap-3">
        {events.map((e) => (
          <li key={e.id} className="text-sm">
            <p className="text-paper">{eventLabel(e.eventType, e.actorType)}</p>
            <p className="text-xs text-slate">
              {e.actor}
              {e.actorType === "COUNTERPARTY_LINK" && " · via signing link"}
              {" · "}
              <time dateTime={e.timestamp.toISOString()}>{formatDateTime(e.timestamp)}</time>
            </p>
          </li>
        ))}
      </ol>
      <p className="mt-3 text-xs text-slate">
        The history is append-only: entries cannot be edited or removed.{" "}
        <Link href={`/audit?agreement=${agreementId}`} className="text-signal hover:underline">
          Open in audit log
        </Link>
      </p>
    </Collapsible>
  );
}

export function Fingerprints({ frozen, executed }: { frozen: string | null; executed: string | null }) {
  if (!frozen && !executed) return null;
  return (
    <Collapsible title="Document fingerprints" summary="SHA-256">
      <dl className="flex flex-col gap-3 text-sm">
        {frozen && (
          <div>
            <dt className="text-xs text-slate">Frozen copy — what both parties sign</dt>
            <dd className="mt-0.5 font-mono text-xs break-all text-paper">{frozen}</dd>
          </div>
        )}
        {executed && (
          <div>
            <dt className="text-xs text-slate">Executed copy</dt>
            <dd className="mt-0.5 font-mono text-xs break-all text-paper">{executed}</dd>
          </div>
        )}
      </dl>
      <p className="mt-3 text-xs text-slate">
        Each signature is bound to the frozen copy&rsquo;s fingerprint; any change to the document would change it.
      </p>
    </Collapsible>
  );
}
