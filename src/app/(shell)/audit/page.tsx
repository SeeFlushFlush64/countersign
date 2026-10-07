import type { Metadata } from "next";
import Link from "next/link";
import { Ban, Eye, FileCheck2, FilePlus2, PenLine, RefreshCw, Send, X, type LucideIcon } from "lucide-react";
import type { StatusEventType } from "@/generated/prisma/enums";
import { requireUser } from "@/lib/session";
import { listAuditEvents } from "@/lib/queries";
import { actorCapacity, eventLabel, evidenceFor } from "@/lib/audit-evidence";
import { EmptyState } from "@/components/ui/EmptyState";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Audit log · Countersign" };

// The audit log: what happened, when, who acted and in what capacity, and
// the evidence recorded with it. Times are UTC, to the second, matching the
// executed PDF's execution page.

const EVENT_ICON: Record<StatusEventType, LucideIcon> = {
  CREATED: FilePlus2,
  SENT: Send,
  VIEWED: Eye,
  SIGNED: PenLine,
  FULLY_EXECUTED: FileCheck2,
  LINK_REISSUED: RefreshCw,
  VOIDED: Ban,
};

const DAY = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const TIME = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "UTC" });

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ agreement?: string | string[] }>;
}) {
  await requireUser();
  const requested = (await searchParams)?.agreement;
  const agreementId = typeof requested === "string" && requested.length <= 64 ? requested : undefined;
  const events = await listAuditEvents({ agreementId });
  const filteredTitle = agreementId ? (events[0]?.document.title ?? null) : null;

  // Group by UTC day, keeping newest-first order.
  const days: { label: string; events: typeof events }[] = [];
  for (const event of events) {
    const label = DAY.format(event.timestamp);
    const last = days.at(-1);
    if (last?.label === label) last.events.push(event);
    else days.push({ label, events: [event] });
  }

  return (
    <div className="w-full max-w-[76rem] px-4 pt-6 pb-16 sm:px-6 lg:px-10 lg:pt-10">
      <header className="max-w-3xl">
        <h1 className="font-[family-name:var(--font-display)] text-2xl leading-tight font-semibold tracking-tight text-paper lg:text-[1.75rem]">
          Audit log
        </h1>
        <p className="mt-2 text-sm text-slate">
          Every step on every agreement, newest first. Entries can only be added: the database rejects any edit or
          deletion. Times are UTC.
        </p>
      </header>

      {agreementId && (
        <div className="mt-6 flex flex-wrap items-center gap-x-3 gap-y-1 border-y border-panel-border py-3 text-sm">
          <span className="text-slate">Showing one agreement:</span>
          {filteredTitle ? (
            <Link
              href={`/agreements/${agreementId}`}
              className="inline-flex min-h-11 items-center font-medium text-paper hover:underline lg:min-h-8"
            >
              {filteredTitle}
            </Link>
          ) : (
            <span className="text-paper">no entries found</span>
          )}
          <Link href="/audit" className="ml-auto inline-flex h-11 items-center gap-1 text-signal hover:underline lg:h-8">
            <X aria-hidden className="size-4" />
            Show all agreements
          </Link>
        </div>
      )}

      {events.length === 0 ? (
        <EmptyState icon={FilePlus2} title="No entries yet">
          Creating an agreement records the first entry.
        </EmptyState>
      ) : (
        <div className="mt-6 flex flex-col gap-8">
          {days.map((day) => (
            <section key={day.label} aria-labelledby={`day-${day.label}`}>
              <h2 id={`day-${day.label}`} className="border-b border-panel-border pb-2 text-xs font-medium text-slate">
                {day.label}
              </h2>
              <ol className="divide-y divide-panel-border">
                {day.events.map((event) => {
                  const Icon = EVENT_ICON[event.eventType];
                  const evidence = evidenceFor(event.eventType, event.metadata);
                  return (
                    <li key={event.id} className="grid grid-cols-[auto_1fr] gap-x-3 py-3 sm:grid-cols-[5.5rem_auto_1fr] sm:gap-x-4">
                      <time
                        dateTime={event.timestamp.toISOString()}
                        className="col-span-2 font-mono text-xs text-slate tabular-nums sm:col-span-1 sm:pt-0.5"
                      >
                        {TIME.format(event.timestamp)}
                      </time>
                      <Icon aria-hidden className="mt-0.5 size-4 shrink-0 text-slate" />
                      <div className="min-w-0">
                        <p className="text-sm text-paper">
                          <span className="font-medium">{eventLabel(event.eventType, event.actorType)}</span>
                          {!agreementId && (
                            <>
                              <span className="text-slate"> · </span>
                              <Link href={`/agreements/${event.document.id}`} className="text-slate hover:text-paper hover:underline">
                                {event.document.title}
                              </Link>
                            </>
                          )}
                        </p>
                        <p className="mt-0.5 text-[13px] text-slate">
                          {event.actor} <span className="text-slate">— {actorCapacity(event.actorType)}</span>
                        </p>
                        {evidence.length > 0 && (
                          <p className="mt-0.5 text-xs text-slate">{evidence.join(" · ")}</p>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
          {events.length >= 200 && <p className="text-xs text-slate">Showing the latest 200 entries.</p>}
        </div>
      )}
    </div>
  );
}
